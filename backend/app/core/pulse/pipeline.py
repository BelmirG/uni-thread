"""Step 2: turn one week of de-identified posts into the Campus Pulse report.

"Discover, then assign" — suited to a small local model:
  1. discover    (LLM)  read the posts in large batches, list candidate topics and problems
  2. consolidate (LLM)  merge the short candidate lists into a fixed taxonomy (+ area per problem)
  3. assign      (LLM)  each post picks numbers from that fixed list: topic, complaint, sentiment
  4. count       (code) distinct students per item, privacy threshold, ranking, trend
  5. summarize   (LLM)  one neutral sentence per item shown — no quotes, no names
  6. scrub       (code) remove any person's name that still slipped through

Why: asking a 7B model to label every post in free text produced dozens of
paraphrases of the same complaint ("bus was full", "shuttle overcrowded"),
each too small to pass the privacy threshold. With a fixed numbered list the
model can only choose, so nothing fragments, and its answer per post is a few
tokens instead of a sentence (~3x faster on a laptop GPU).

Counting and the threshold live in code, so "at least N different students"
holds even when the model misbehaves.
"""
import re
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.core.pulse.collect import STAFF_NAME_RE, Collected, NameMatcher, PulseItem
from app.core.pulse.llm import PulseLLM

AREAS = [
    "IT & Wi-Fi", "Housing & Dorms", "Food & Cafeteria", "Transport",
    "Student Services", "Academics & Exams", "Facilities", "Other",
]
SENTIMENT = {"pos": "positive", "neu": "neutral", "neg": "negative"}
SOURCE_LABEL = {"feed": "feed", "club": "club", "anonymous": "anonymous board"}
# Labels that mean "no real subject" — kept out of the ranking.
CATCH_ALL = {"other", "none", "n/a", "na", "general", "misc", "miscellaneous", "various",
             "unknown", "random", "student life", "casual chat", "chat", "campus life", "social"}

MAX_TOPICS, MAX_COMPLAINTS = 15, 12
DISCOVER_CHUNK, TEXT_FOR_DISCOVERY = 50, 250

_LANG = "Posts come from students at the International University of Sarajevo and may mix English, Bosnian and Turkish."
_NO_NAMES = "Never include names of people (students or staff) anywhere in your answer."

_TOPICS_VS_COMPLAINTS = """A topic is a BROAD subject (1-2 words) that can contain both praise and problems, e.g.
"Library" (covers Wi-Fi problems AND opening hours), "Dorms", "Transport", "Exams", "Cafeteria",
"Career Fair", "Startup Weekend". Include positive and neutral subjects (events, opportunities, things
students like), not only problems. Never a vague category like "Student Life", "Campus" or "General".
A complaint is one SPECIFIC problem inside a topic that the university could fix."""

DISCOVER_SYSTEM = f"""TASK: discover
Read these student posts and list:
- topics: the distinct subjects students discuss, in Title Case.
- complaints: distinct concrete problems, each one specific statement of at most 8 words
  (e.g. "Morning shuttle buses are overcrowded", "Library Wi-Fi keeps disconnecting").
{_TOPICS_VS_COMPLAINTS}
Ignore greetings, jokes and casual chat. At most 10 topics and 8 complaints. {_LANG} {_NO_NAMES}"""

CONSOLIDATE_SYSTEM = f"""TASK: consolidate
You get candidate topics and complaints found in different batches of one week of student posts.
{_TOPICS_VS_COMPLAINTS}
Topics: merge candidates about the same broad subject into one (e.g. "Library Wi-Fi" and "Library Hours"
become "Library"), keeping the clearest 1-2 word name. Keep every distinct subject, including positive ones.
Complaints: combine every complaint about the same service or facility into ONE complaint, written as a full
problem statement with a verb, at most 10 words (e.g. "Morning shuttle buses are overcrowded and late",
"Library Wi-Fi keeps disconnecting", "Dorm heating has not been turned on", "Midterm exams clash on the same
day"). Never a bare noun like "Dorm Heating" or "Wi-Fi". Keep complaints about different services separate.
If PREVIOUS NAMES contains a name for the same subject or problem, use it exactly.
For each complaint choose the area responsible for fixing it.
Return at most {MAX_TOPICS} topics and {MAX_COMPLAINTS} complaints. {_NO_NAMES}"""

ASSIGN_SYSTEM = f"""TASK: assign
You get a numbered list of TOPICS, a numbered list of COMPLAINTS, then student posts.
For EVERY post write exactly one line, and nothing else:
<post id> <topic number> <complaint number> <sentiment>
- topic number: the topic the post is about, or 0 if none fits (including casual chat)
- complaint number: the complaint the post makes, or 0 if it makes none. Choose it whenever the post
  describes that problem, even in different words or in Bosnian/Turkish.
- sentiment: pos, neu or neg
Example:
P1 3 0 pos
P2 1 2 neg
{_LANG}"""

_ASSIGN_LINE = re.compile(r"^\W*(P\d+)\W+(\d+)\W+(\d+)\W+(pos|neu|neg)\b", re.IGNORECASE)

SUMMARIZE_SYSTEM = f"""TASK: summarize
For each item, write ONE neutral sentence of at most 25 words describing what students are saying, based on the sample posts.
Do not quote posts. Do not mention how many students. Write in English. {_NO_NAMES}"""

_STR_LIST = {"type": "array", "items": {"type": "string"}}
_DISCOVER_SCHEMA = {
    "type": "object",
    "properties": {"topics": _STR_LIST, "complaints": _STR_LIST},
    "required": ["topics", "complaints"],
}
_CONSOLIDATE_SCHEMA = {
    "type": "object",
    "properties": {
        "topics": _STR_LIST,
        "complaints": {"type": "array", "items": {
            "type": "object",
            "properties": {"problem": {"type": "string"}, "area": {"type": "string", "enum": AREAS}},
            "required": ["problem", "area"],
        }},
    },
    "required": ["topics", "complaints"],
}
_SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {"summaries": {"type": "array", "items": {
        "type": "object",
        "properties": {"key": {"type": "string"}, "summary": {"type": "string"}},
        "required": ["key", "summary"],
    }}},
    "required": ["summaries"],
}


@dataclass
class Assigned:
    topic: str | None       # None = no real subject (casual chat)
    complaint: str | None   # None = not a complaint
    sentiment: str


@dataclass
class Cluster:
    name: str
    area: str = "Other"
    students: set[str] = field(default_factory=set)
    posts: int = 0
    sentiments: Counter = field(default_factory=Counter)
    samples: list[str] = field(default_factory=list)

    def add(self, item: PulseItem, sentiment: str) -> None:
        self.students.add(item.student)
        self.posts += 1
        self.sentiments[sentiment] += 1
        if len(self.samples) < 6:
            self.samples.append(item.text[:220])


def _label(text, limit: int) -> str:
    text = " ".join(str(text).split()).strip(" .\"'")
    return text[:limit]


def _is_catch_all(name: str) -> bool:
    return name.casefold() in CATCH_ALL


class _Calls:
    """Counts LLM calls and time per stage — the report's stats feed the thesis' speed/cost discussion."""
    def __init__(self, llm: PulseLLM):
        self.llm, self.count, self.seconds = llm, 0, Counter()

    async def __call__(self, stage: str, system: str, user: str, schema: dict | None) -> dict | str:
        """schema=None -> plain-text reply (faster to generate; caller validates)."""
        self.count += 1
        started = time.monotonic()
        try:
            if schema is None:
                return await self.llm.text_chat(system, user)
            return await self.llm.json_chat(system, user, schema)
        finally:
            self.seconds[stage] += time.monotonic() - started


def _dedupe(names: list[str], limit: int) -> list[str]:
    seen, out = set(), []
    for name in names:
        key = name.casefold()
        if name and key not in seen and not _is_catch_all(name):
            seen.add(key)
            out.append(name)
    return out[:limit]


# ── 1-2. discover + consolidate ───────────────────────────────────────────────

async def discover(call: _Calls, items: list[PulseItem]) -> tuple[list[str], list[str]]:
    topics, complaints = [], []
    for i in range(0, len(items), DISCOVER_CHUNK):
        batch = items[i:i + DISCOVER_CHUNK]
        user = "POSTS:\n" + "\n".join(f"- {it.text[:TEXT_FOR_DISCOVERY]}" for it in batch)
        data = await call("discover", DISCOVER_SYSTEM, user, _DISCOVER_SCHEMA)
        topics += [_label(t, 40) for t in data.get("topics", [])]
        complaints += [_label(c, 90) for c in data.get("complaints", [])]
    return _dedupe(topics, 60), _dedupe(complaints, 60)


async def consolidate(
    call: _Calls, topics: list[str], complaints: list[str], previous: list[str],
) -> tuple[list[str], list[tuple[str, str]]]:
    """-> (topic names, [(complaint problem, area)])"""
    if not topics and not complaints:
        return [], []
    user = (
        f"PREVIOUS NAMES: {'; '.join(previous) if previous else '(none)'}\n\n"
        "CANDIDATE TOPICS:\n" + "\n".join(f"- {t}" for t in topics)
        + "\n\nCANDIDATE COMPLAINTS:\n" + "\n".join(f"- {c}" for c in complaints)
    )
    data = await call("consolidate", CONSOLIDATE_SYSTEM, user, _CONSOLIDATE_SCHEMA)
    final_topics = _dedupe([_label(t, 40) for t in data.get("topics", [])], MAX_TOPICS)
    seen, final_complaints = set(), []
    for c in data.get("complaints", []):
        problem = _label(c.get("problem", ""), 90)
        area = c.get("area") if c.get("area") in AREAS else "Other"
        if problem and problem.casefold() not in seen:
            seen.add(problem.casefold())
            final_complaints.append((problem, area))
    return final_topics, final_complaints[:MAX_COMPLAINTS]


# ── 3. assign ─────────────────────────────────────────────────────────────────

async def assign(
    call: _Calls, items: list[PulseItem], topics: list[str], complaints: list[str], chunk: int,
) -> dict[str, Assigned]:
    result: dict[str, Assigned] = {}
    if not topics and not complaints:
        return result
    header = (
        "TOPICS:\n0. none of these / casual chat\n" + "\n".join(f"{i}. {t}" for i, t in enumerate(topics, 1))
        + "\n\nCOMPLAINTS:\n0. no complaint\n" + "\n".join(f"{i}. {c}" for i, c in enumerate(complaints, 1))
    )
    for i in range(0, len(items), chunk):
        batch = items[i:i + chunk]
        for _ in range(2):  # second pass only for posts the model skipped
            pending = [it for it in batch if it.ref not in result]
            if not pending:
                break
            user = header + "\n\nPOSTS:\n" + "\n".join(
                f"{it.ref} [{SOURCE_LABEL[it.source]}]: {it.text}" for it in pending
            )
            reply = await call("assign", ASSIGN_SYSTEM, user, None)
            wanted = {it.ref for it in pending}
            for line in str(reply).splitlines():
                m = _ASSIGN_LINE.match(line.strip())
                if not m or m.group(1) not in wanted:
                    continue  # anything malformed is dropped, never guessed at
                t, c = int(m.group(2)), int(m.group(3))
                t = t if 1 <= t <= len(topics) else 0
                c = c if 1 <= c <= len(complaints) else 0
                result[m.group(1)] = Assigned(
                    topic=topics[t - 1] if t else None,
                    complaint=complaints[c - 1] if c else None,
                    sentiment=SENTIMENT[m.group(4).lower()],
                )
    return result


# ── 4. count, threshold, rank, trend ──────────────────────────────────────────

def mood(sentiments: Counter) -> str:
    """Questions and announcements are neutral by nature, so a clear lean (>= 40%
    and outweighing the opposite) decides the mood rather than a strict majority."""
    total = sum(sentiments.values()) or 1
    pos, neg = sentiments["positive"] / total, sentiments["negative"] / total
    if neg >= 0.4 and neg > pos:
        return "negative"
    if pos >= 0.4 and pos > neg:
        return "positive"
    if pos >= 0.25 and neg >= 0.25:
        return "mixed"
    return "neutral"


def trend(name: str, students: int, previous: dict[str, int] | None) -> tuple[str, int | None]:
    if previous is None:
        return "unknown", None          # no earlier report to compare against
    before = previous.get(name.casefold())
    if before is None:
        return "new", None
    if students > before * 1.2:
        return "rising", before
    if students < before * 0.8:
        return "falling", before
    return "steady", before


def rank(clusters: dict[str, Cluster], min_students: int) -> tuple[list[Cluster], int]:
    """Clusters with at least `min_students` distinct students, biggest first,
    plus how many smaller ones were withheld for privacy."""
    eligible = [c for c in clusters.values() if len(c.students) >= min_students]
    eligible.sort(key=lambda c: (len(c.students), c.posts), reverse=True)
    return eligible, len(clusters) - len(eligible)


# ── 6. scrub ──────────────────────────────────────────────────────────────────

def scrub_text(text: str, names: NameMatcher) -> tuple[str, int]:
    text, staff_hits = STAFF_NAME_RE.subn("a staff member", text)
    text, name_hits = names.sub(text, "someone")
    return text, staff_hits + name_hits


# ── orchestration ─────────────────────────────────────────────────────────────

async def build_report(
    llm: PulseLLM,
    collected: Collected,
    week_start: date,
    previous_report: dict | None,
    *,
    min_students: int,
    chunk: int,
) -> tuple[dict, dict]:
    started = time.monotonic()
    call = _Calls(llm)
    items = collected.items

    prev = previous_report or {}
    prev_topics = {t["name"].casefold(): t["students"] for t in prev.get("topics_all", [])} if previous_report else None
    prev_complaints = {c["problem"].casefold(): c["students"] for c in prev.get("complaints_all", [])} if previous_report else None
    previous_names = [t["name"] for t in prev.get("topics_all", [])] + [c["problem"] for c in prev.get("complaints_all", [])]

    cand_topics, cand_complaints = await discover(call, items)
    topic_names, complaint_defs = await consolidate(call, cand_topics, cand_complaints, previous_names)
    area_of = dict(complaint_defs)
    assigned = await assign(call, items, topic_names, [p for p, _ in complaint_defs], chunk)

    topics: dict[str, Cluster] = {}
    complaints: dict[str, Cluster] = {}
    for item in items:
        a = assigned.get(item.ref)
        if a is None:
            continue
        if a.topic:
            topics.setdefault(a.topic, Cluster(a.topic)).add(item, a.sentiment)
        if a.complaint:
            complaints.setdefault(a.complaint, Cluster(a.complaint, area=area_of.get(a.complaint, "Other"))).add(item, a.sentiment)

    ranked_topics, hidden_topics = rank(topics, min_students)
    ranked_complaints, hidden_complaints = rank(complaints, min_students)
    top_topics, top_complaints = ranked_topics[:5], ranked_complaints[:5]
    going_well = [c for c in ranked_topics if mood(c.sentiments) == "positive"][:2]

    # 5. one neutral sentence per item shown
    keyed = (
        [(f"T{i}", "topic", c) for i, c in enumerate(top_topics, 1)]
        + [(f"C{i}", "complaint", c) for i, c in enumerate(top_complaints, 1)]
        + [(f"G{i}", "positive topic", c) for i, c in enumerate(going_well, 1)]
    )
    summaries: dict[str, str] = {}
    if keyed:
        user = "\n\n".join(
            f"{key} — {c.name} ({kind})\nSample posts:\n" + "\n".join(f"- {s}" for s in c.samples)
            for key, kind, c in keyed
        )
        data = await call("summarize", SUMMARIZE_SYSTEM, user, _SUMMARY_SCHEMA)
        summaries = {str(s.get("key")): _label(s.get("summary", ""), 300) for s in data.get("summaries", [])}

    redactions = 0

    def clean(text: str) -> str:
        nonlocal redactions
        text, hits = scrub_text(text, collected.names)
        redactions += hits
        return text

    def topic_row(i: int, c: Cluster) -> dict:
        t, before = trend(c.name, len(c.students), prev_topics)
        return {
            "rank": i, "name": clean(c.name), "students": len(c.students), "posts": c.posts,
            "mood": mood(c.sentiments), "sentiment": dict(c.sentiments),
            "trend": t, "previous_students": before, "summary": clean(summaries.get(f"T{i}", "")),
        }

    def complaint_row(i: int, c: Cluster) -> dict:
        t, before = trend(c.name, len(c.students), prev_complaints)
        return {
            "rank": i, "problem": clean(c.name), "area": c.area, "students": len(c.students), "posts": c.posts,
            "trend": t, "previous_students": before, "summary": clean(summaries.get(f"C{i}", "")),
        }

    report = {
        "week_start": week_start.isoformat(),
        "week_end": (week_start + timedelta(days=6)).isoformat(),
        "min_students": min_students,
        "topics": [topic_row(i, c) for i, c in enumerate(top_topics, 1)],
        "complaints": [complaint_row(i, c) for i, c in enumerate(top_complaints, 1)],
        "going_well": [
            {"name": clean(c.name), "students": len(c.students), "summary": clean(summaries.get(f"G{i}", ""))}
            for i, c in enumerate(going_well, 1)
        ],
        "hidden_below_threshold": {"topics": hidden_topics, "complaints": hidden_complaints},
        # Every item that met the threshold (names + counts only), so next week can
        # compute trends and reuse names. Same privacy level as the visible list.
        "topics_all": [{"name": clean(c.name), "students": len(c.students)} for c in ranked_topics],
        "complaints_all": [{"problem": clean(c.name), "students": len(c.students)} for c in ranked_complaints],
    }
    sources = Counter(it.source for it in items)
    stats = {
        "posts_analyzed": len(items),
        "posts_assigned": len(assigned),
        "students": collected.students,
        "sources": {k: sources.get(k, 0) for k in ("feed", "club", "anonymous")},
        "taxonomy": {"topics": len(topic_names), "complaints": len(complaint_defs)},
        "llm_calls": call.count,
        "stage_seconds": {k: round(v, 1) for k, v in call.seconds.items()},
        "duration_seconds": round(time.monotonic() - started, 1),
        "redactions": redactions,
    }
    return report, stats
