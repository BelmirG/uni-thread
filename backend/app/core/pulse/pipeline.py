"""Step 2: turn one week of de-identified posts into the Campus Pulse report.

"Discover, then assign" — suited to a small local model:
  1. discover    (LLM)  read the posts in batches, list candidate topics and problems per batch
  2. consolidate (code) topics: group name variants, rank by how many batches raised them
                 (LLM)  complaints: merge paraphrases (+ area), fenced by code checks that drop
                        invented problems and restore widely-raised ones the model left out
  3. assign      (LLM)  each post picks numbers from that fixed list: topic, complaint, sentiment
  4. count       (code) distinct students per item, privacy threshold, ranking, trend,
                        same-meaning names matched to last week's, complaint-only subjects
                        moved out of the topics list
  5. describe    (LLM)  summary + 2-4 concrete points per item shown (+ what students ask
                        for, for complaints) — no quotes, no names, only what several said
  6. scrub       (code) remove any person's name that still slipped through

Why: asking a 7B model to label every post in free text produced dozens of
paraphrases of the same complaint ("bus was full", "shuttle overcrowded"),
each too small to pass the privacy threshold. With a fixed numbered list the
model can only choose, so nothing fragments, and its answer per post is a few
tokens instead of a sentence (~3x faster on a laptop GPU).

Counting and the threshold live in code, so "at least N different students"
holds even when the model misbehaves.
"""
import logging
import re
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.core.pulse.collect import STAFF_NAME_RE, Collected, NameMatcher, PulseItem
from app.core.pulse.llm import PulseLLM

logger = logging.getLogger(__name__)

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
DISCOVER_CHUNK, TEXT_FOR_DISCOVERY = 40, 250

_LANG = "Posts come from students at the International University of Sarajevo and may mix English, Bosnian and Turkish."
_NO_NAMES = "Never include names of people (students or staff) anywhere in your answer."

# Examples in prompts are deliberately about things that never occur in the data
# (chess, vending machines): a small model copies examples into its answers, and
# a copied example must be obviously out of place rather than a plausible fake complaint.
DISCOVER_SYSTEM = f"""TASK: discover
Read these student posts and list:
- topics: EVERY distinct subject that more than one post discusses — events, studies, plans, opportunities,
  services, problems — as a broad 1-2 word name in Title Case (e.g. "Chess Tournament", "Lecture Recordings").
  Include positive and neutral subjects, not only problems. Never a vague category like "Student Life".
- complaints: the concrete problems students want the university to fix, each one specific statement of at most
  8 words (e.g. "Vending machines keep taking money").
Ignore greetings, jokes and casual chat. Up to 15 topics and 10 complaints. {_LANG} {_NO_NAMES}"""

CONSOLIDATE_SYSTEM = f"""TASK: consolidate
You get candidate complaint statements found in different batches of one week of student posts.
Combine every candidate about the same service or facility into ONE complaint, written as a full problem
statement with a verb, at most 10 words (e.g. "Vending machines keep taking money without giving snacks").
Never a bare noun. Keep complaints about different services separate. ONLY use problems that appear in the
candidates — never add a problem that is not there.
If PREVIOUS NAMES contains a statement for the same problem, use it exactly.
For each complaint choose the area responsible for fixing it. Return at most {MAX_COMPLAINTS}. {_NO_NAMES}"""

ASSIGN_SYSTEM = f"""TASK: assign
You get a numbered list of TOPICS, a numbered list of COMPLAINTS, then student posts.
For EVERY post write exactly one line, and nothing else:
<post id> <topic number> <complaint number> <sentiment>
- topic number: the topic the post is about, or 0 if none fits (including casual chat)
- complaint number: the complaint the post makes, or 0 if it makes none. Choose it whenever the post
  describes that problem, even in different words or in Bosnian/Turkish.
- sentiment: pos (enjoyment, praise, excitement, gratitude), neg (frustration, complaint, worry),
  or neu (questions, announcements, plain information)
Example:
P1 3 0 pos
P2 1 2 neg
{_LANG}"""

_ASSIGN_LINE = re.compile(r"^\W*(P\d+)\W+(\d+)\W+(\d+)\W+(pos|neu|neg)\b", re.IGNORECASE)

_DETAIL_RULES = f"""Only include a point if MORE THAN ONE sample post supports it — leave out anything a single post says.
Do not quote posts, do not mention how many students, and leave out personal details (a specific person's
room, schedule or situation). Write in English. {_NO_NAMES}"""

DESCRIBE_TOPICS_SYSTEM = f"""TASK: describe-topics
For each topic, using its sample posts, write:
- summary: one neutral sentence (at most 25 words) saying what students are discussing.
- points: 2-4 short bullet points (at most 20 words each) with the concrete details of the discussion:
  what is happening, what students ask, share or recommend, their opinions and plans.
{_DETAIL_RULES}"""

DESCRIBE_COMPLAINTS_SYSTEM = f"""TASK: describe-complaints
For each complaint, using its sample posts, write:
- title: a neutral problem statement of 4-8 words that says WHAT IS WRONG (e.g. "Vending machines keep
  taking money"), not just the subject ("Vending machine issues"). In your own words — never copied from a post.
- area: who is responsible for fixing it.
- summary: one neutral sentence (at most 25 words) describing the problem.
- points: 2-4 short bullet points (at most 20 words each) with concrete details: when and where it happens
  and how it affects students.
- request: what students are asking the university to do, at most 15 words, or "" if they don't say.
{_DETAIL_RULES}"""

# A subject whose posts are mostly complaints is shown only under complaints,
# so the two sections answer different questions.
COMPLAINT_TOPIC_SHARE = 0.7
SAMPLES_PER_ITEM = 10

_STR_LIST = {"type": "array", "items": {"type": "string"}}
_DISCOVER_SCHEMA = {
    "type": "object",
    "properties": {"topics": _STR_LIST, "complaints": _STR_LIST},
    "required": ["topics", "complaints"],
}
_CONSOLIDATE_SCHEMA = {
    "type": "object",
    "properties": {
        "complaints": {"type": "array", "items": {
            "type": "object",
            "properties": {"problem": {"type": "string"}, "area": {"type": "string", "enum": AREAS}},
            "required": ["problem", "area"],
        }},
    },
    "required": ["complaints"],
}
def _describe_schema(with_request: bool) -> dict:
    props = {
        "key": {"type": "string"},
        "summary": {"type": "string"},
        "points": {"type": "array", "items": {"type": "string"}},
    }
    if with_request:
        props = {"key": {"type": "string"}, "title": {"type": "string"},
                 "area": {"type": "string", "enum": AREAS},
                 **{k: v for k, v in props.items() if k != "key"}}
        props["request"] = {"type": "string"}
    return {
        "type": "object",
        "properties": {"items": {"type": "array", "items": {
            "type": "object", "properties": props, "required": list(props),
        }}},
        "required": ["items"],
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
    complaint_posts: int = 0
    sentiments: Counter = field(default_factory=Counter)
    # One post per student: the model describes what *several* students said,
    # and no single student can dominate (or be traced through) the details.
    by_student: dict[str, str] = field(default_factory=dict)

    def add(self, item: PulseItem, sentiment: str, *, is_complaint: bool = False) -> None:
        self.students.add(item.student)
        self.posts += 1
        self.complaint_posts += is_complaint
        self.sentiments[sentiment] += 1
        self.by_student.setdefault(item.student, item.text[:200])

    def samples(self, n: int = SAMPLES_PER_ITEM) -> list[str]:
        texts = list(self.by_student.values())
        if len(texts) <= n:
            return texts
        step = len(texts) / n  # spread across the week rather than the first n
        return [texts[int(i * step)] for i in range(n)]

    @property
    def complaint_share(self) -> float:
        return self.complaint_posts / self.posts if self.posts else 0.0


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


# ── 1-2. discover + consolidate ───────────────────────────────────────────────

async def discover(call: _Calls, items: list[PulseItem]) -> tuple[list[list[str]], list[list[str]]]:
    """Candidate topics and complaints, kept per batch so code can count how
    widely each one came up across the week."""
    topic_batches, complaint_batches = [], []
    for i in range(0, len(items), DISCOVER_CHUNK):
        batch = items[i:i + DISCOVER_CHUNK]
        user = "POSTS:\n" + "\n".join(f"- {it.text[:TEXT_FOR_DISCOVERY]}" for it in batch)
        data = await call("discover", DISCOVER_SYSTEM, user, _DISCOVER_SCHEMA)
        topic_batches.append([t for t in (_label(x, 40) for x in data.get("topics", [])) if t and not _is_catch_all(t)])
        complaint_batches.append([c for c in (_label(x, 90) for x in data.get("complaints", [])) if c])
    return topic_batches, complaint_batches


def _same_subject(a: str, b: str) -> bool:
    """"Shuttles" ~ "Shuttle Buses", "WiFi" ~ "Wi-Fi", "Library" ~ "Library Wi-Fi"."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return False
    small, big = sorted((ta, tb), key=len)
    return ta == tb or (len(small) <= 2 and small <= big)


def _group(batches: list[list[str]], same) -> list[dict]:
    groups: list[dict] = []
    for b, names in enumerate(batches):
        for name in names:
            g = next((g for g in groups if any(same(name, n) for n in g["names"])), None)
            if g is None:
                g = {"names": Counter(), "batches": set()}
                groups.append(g)
            g["names"][name] += 1
            g["batches"].add(b)
    groups.sort(key=lambda g: (len(g["batches"]), sum(g["names"].values())), reverse=True)
    return groups


def _representative(names: Counter) -> str:
    return min(names, key=lambda n: (-names[n], len(n)))  # most common wording, then shortest


def merge_topics(batches: list[list[str]], previous: list[str]) -> list[str]:
    """The topic list is built in code, not by the LLM. When the model merged topics
    it kept only complaint-related subjects and dropped e.g. "Career Fair" — so code
    groups name variants and ranks subjects by how many batches raised them."""
    batches = [[n for n in names if not _is_catch_all(n)] for names in batches]
    out = []
    for g in _group(batches, _same_subject)[:MAX_TOPICS]:
        prev = next((p for p in previous if any(_same_subject(p, n) for n in g["names"])), None)
        out.append(prev or _representative(g["names"]))
    return out


def concise(statement: str, max_words: int = 8) -> str:
    """Keep problem statements short. Long ones tend to be a single student's sentence
    copied verbatim — effectively a quote — so cut at the first natural break."""
    words = statement.split()
    if len(words) <= max_words:
        return statement
    head = re.split(r"\s*[,;:—–]\s*|\s+-\s+", statement, maxsplit=1)[0].strip()
    return head if 3 <= len(head.split()) <= max_words else " ".join(words[:max_words])


def _shares_words(a: str, b: str, n: int = 2) -> bool:
    return len(_tokens(a) & _tokens(b)) >= n


async def consolidate_complaints(
    call: _Calls, batches: list[list[str]], previous: list[str],
) -> list[tuple[str, str]]:
    """LLM merges paraphrased complaints (that needs language understanding),
    fenced in by two code checks:
      - a merged complaint must share words with something students actually wrote,
        so a problem nobody raised (e.g. one copied from a prompt example) is dropped;
      - a complaint raised in several batches that the model left out is put back.
    """
    candidates = list(dict.fromkeys(c for batch in batches for c in batch))
    if not candidates:
        return []
    user = (
        f"PREVIOUS NAMES: {'; '.join(previous) if previous else '(none)'}\n\n"
        "CANDIDATE COMPLAINTS:\n" + "\n".join(f"- {c}" for c in candidates[:60])
    )
    data = await call("consolidate", CONSOLIDATE_SYSTEM, user, _CONSOLIDATE_SCHEMA)
    final: list[tuple[str, str]] = []
    for c in data.get("complaints", []):
        problem = concise(_label(c.get("problem", ""), 90))
        area = c.get("area") if c.get("area") in AREAS else "Other"
        if not problem or any(problem.casefold() == p.casefold() for p, _ in final):
            continue
        # Grounded = close to one thing students wrote, or about a subject several
        # candidates mention (the model rephrases: "Shuttles are overcrowded" vs
        # "bus was packed"). An invented problem matches neither.
        if any(_shares_words(problem, cand) for cand in candidates) or \
                sum(_shares_words(problem, cand, 1) for cand in candidates) >= 2:
            final.append((problem, area))
    for g in _group(batches, _shares_words):
        # Restore only subjects nothing in the list covers yet — restoring a rephrased
        # duplicate would split one problem's posts in two, below the threshold.
        if len(g["batches"]) >= 2 and not any(_shares_words(p, n, 1) for p, _ in final for n in g["names"]):
            final.append((concise(_representative(g["names"])), "Other"))
    return final[:MAX_COMPLAINTS]


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
    """Judge the mood from the posts that express an opinion. Questions and
    announcements are neutral by nature (and a small model labels many posts
    neutral), so e.g. 15 positive / 3 negative / 25 neutral is clearly positive.
    Too few opinionated posts -> neutral."""
    pos, neg = sentiments["positive"], sentiments["negative"]
    total = sum(sentiments.values())
    if pos + neg < max(3, 0.2 * total):
        return "neutral"
    if pos >= 2 * neg:
        return "positive"
    if neg >= 2 * pos:
        return "negative"
    return "mixed"


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


_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "not",
    "and", "or", "of", "in", "on", "at", "to", "for", "with", "too", "very", "still", "again", "keeps", "keep",
}


def _stem(word: str) -> str:
    """Crude English stemming — enough to match "overcrowded"/"overcrowding",
    "buses"/"bus" and "shuttles"/"shuttle"."""
    if len(word) > 4 and word.endswith("ing"):
        return word[:-3]
    if len(word) > 4 and word.endswith("ed"):
        return word[:-2]
    if len(word) > 4 and word.endswith(("ses", "xes", "zes", "ches", "shes")):
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def _tokens(name: str) -> set[str]:
    text = re.sub(r"wi[\s-]?fi", "wifi", name.casefold())
    return {_stem(w) for w in re.findall(r"[a-z0-9]+", text) if w not in _STOPWORDS}


def match_previous(names: list[str], previous: list[str]) -> dict[str, str]:
    """Map this week's names onto last week's when they mean the same thing, so the
    same problem keeps one name and its trend reads correctly.

    A small model rephrases freely between runs ("Cafeteria prices increased" vs
    "Cafeteria prices have increased"); matching in code is deterministic. Two
    names match when they share at least 2 meaningful words making up at least
    half of the shorter one — or, for 1-2 word topic names, when every word of
    the shorter one appears in the other ("Shuttles" ~ "Shuttle Buses").
    """
    candidates = []
    for name in names:
        a = _tokens(name)
        for prev in previous:
            if name.casefold() == prev.casefold():
                candidates.append((2.0, name, prev))
                continue
            b = _tokens(prev)
            if not a or not b:
                continue
            shared = len(a & b)
            overlap = shared / min(len(a), len(b))
            if (shared >= 2 and overlap >= 0.5) or (min(len(a), len(b)) <= 2 and overlap == 1.0):
                candidates.append((overlap + shared / 10, name, prev))
    mapping: dict[str, str] = {}
    used: set[str] = set()
    for _, name, prev in sorted(candidates, reverse=True):  # best matches first, one-to-one
        if name not in mapping and prev not in used:
            mapping[name] = prev
            used.add(prev)
    return mapping


def rank(clusters: dict[str, Cluster], min_students: int) -> tuple[list[Cluster], int]:
    """Clusters with at least `min_students` distinct students, biggest first,
    plus how many smaller ones were withheld for privacy."""
    eligible = [c for c in clusters.values() if len(c.students) >= min_students]
    eligible.sort(key=lambda c: (len(c.students), c.posts), reverse=True)
    return eligible, len(clusters) - len(eligible)


# ── 5. describe ───────────────────────────────────────────────────────────────

async def describe(call: _Calls, kind: str, clusters: list[Cluster]) -> dict[str, dict]:
    """name -> {summary, points, request, title, area}.

    One call describes every item; anything still missing is then described on its
    own (a one-item prompt is the most reliable) — a report must not show a topic
    with no description. Misses are logged with the model's reply for diagnosis."""
    if not clusters:
        return {}
    is_complaint = kind == "complaints"
    system = DESCRIBE_COMPLAINTS_SYSTEM if is_complaint else DESCRIBE_TOPICS_SYSTEM
    schema = _describe_schema(with_request=is_complaint)
    prefix = "C" if is_complaint else "T"
    keyed = {f"{prefix}{i}": c for i, c in enumerate(clusters, 1)}
    out: dict[str, dict] = {}

    def absorb(rows: list, pending: dict[str, Cluster]) -> None:
        by_name = {c.name.casefold(): c for c in pending.values()}
        ordered = list(pending.values())
        for pos, row in enumerate(rows):
            # The model labels items by id ("T2"), by name ("Erasmus Program"), or
            # neither — accept all three, rather than discarding a good answer.
            key = str(row.get("key", ""))
            m = re.search(rf"\b{prefix}\d+\b", key.upper())
            c = pending.get(m.group(0)) if m else None
            if c is None:
                c = by_name.get(_label(key, 120).casefold()) or next(
                    (x for x in ordered if _same_subject(key, x.name)), None)
            if c is None and len(rows) == len(ordered):
                c = ordered[pos]
            summary = _label(row.get("summary", ""), 300)
            if c is None or not summary or c.name in out:
                continue
            out[c.name] = {
                "summary": summary,
                "points": [_label(p, 200) for p in row.get("points", []) if _label(p, 200)][:4],
                "request": _label(row.get("request", ""), 160) if is_complaint else "",
                "title": concise(_label(row.get("title", ""), 90)) if is_complaint else "",
                "area": row.get("area") if is_complaint and row.get("area") in AREAS else "",
            }

    def prompt(items: dict[str, Cluster]) -> str:
        return "\n\n".join(
            f"{key} — {c.name}\nSample posts:\n" + "\n".join(f"- {s}" for s in c.samples())
            for key, c in items.items()
        )

    data = await call(f"describe_{kind}", system, prompt(keyed), schema)
    absorb(data.get("items", []), keyed)
    for key, c in keyed.items():
        for _ in range(2):
            if c.name in out:
                break
            data = await call(f"describe_{kind}", system, prompt({key: c}), schema)
            absorb(data.get("items", []), {key: c})
        if c.name not in out:
            logger.warning("Campus Pulse: no description for %r (%s); last reply: %.400s", c.name, kind, data)
    return out


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
    topic_batches, complaint_batches = await discover(call, items)
    topic_names = merge_topics(topic_batches, [t["name"] for t in prev.get("topics_all", [])])
    complaint_defs = await consolidate_complaints(
        call, complaint_batches, [c["problem"] for c in prev.get("complaints_all", [])],
    )
    area_of = dict(complaint_defs)
    assigned = await assign(call, items, topic_names, [p for p, _ in complaint_defs], chunk)

    # Keep last week's wording when this week's means the same thing (deterministic, in code).
    topic_alias = match_previous(topic_names, [t["name"] for t in prev.get("topics_all", [])])
    complaint_alias = match_previous([p for p, _ in complaint_defs], [c["problem"] for c in prev.get("complaints_all", [])])

    topics: dict[str, Cluster] = {}
    complaints: dict[str, Cluster] = {}
    for item in items:
        a = assigned.get(item.ref)
        if a is None:
            continue
        if a.topic:
            name = topic_alias.get(a.topic, a.topic)
            topics.setdefault(name, Cluster(name)).add(item, a.sentiment, is_complaint=bool(a.complaint))
        if a.complaint:
            name = complaint_alias.get(a.complaint, a.complaint)
            area = area_of.get(a.complaint, "Other")
            complaints.setdefault(name, Cluster(name, area=area)).add(item, a.sentiment, is_complaint=True)

    ranked_topics, hidden_topics = rank(topics, min_students)
    ranked_complaints, hidden_complaints = rank(complaints, min_students)
    # Topics answer "what are students talking about?"; a subject that is almost
    # entirely complaints is already covered under complaints, so it moves there.
    discussion = [c for c in ranked_topics if c.complaint_share < COMPLAINT_TOPIC_SHARE]
    complaint_heavy = [c for c in ranked_topics if c.complaint_share >= COMPLAINT_TOPIC_SHARE]
    top_topics, top_complaints = discussion[:5], ranked_complaints[:5]
    going_well = [c for c in discussion if mood(c.sentiments) == "positive"][:2]

    # 5. describe each item shown: summary + concrete points (+ what students ask for)
    to_describe = top_topics + [c for c in going_well if c not in top_topics]
    topic_details = await describe(call, "topics", to_describe)
    complaint_details = await describe(call, "complaints", top_complaints)

    redactions = 0

    def clean(text: str) -> str:
        nonlocal redactions
        text, hits = scrub_text(text, collected.names)
        redactions += hits
        return text

    def details(found: dict[str, dict], c: Cluster) -> dict:
        d = found.get(c.name, {})
        return {
            "summary": clean(d.get("summary", "")),
            "points": [clean(p) for p in d.get("points", [])],
            "request": clean(d.get("request", "")),
            "title": clean(d.get("title", "")),
            "area": d.get("area", ""),
        }

    def topic_row(i: int, c: Cluster) -> dict:
        t, before = trend(c.name, len(c.students), prev_topics)
        d = details(topic_details, c)
        return {
            "rank": i, "name": clean(c.name), "students": len(c.students), "posts": c.posts,
            "mood": mood(c.sentiments), "sentiment": dict(c.sentiments),
            "trend": t, "previous_students": before, "summary": d["summary"], "points": d["points"],
        }

    def complaint_row(i: int, c: Cluster) -> dict:
        t, before = trend(c.name, len(c.students), prev_complaints)
        d = details(complaint_details, c)
        # Shown: a neutral title written from ~10 students' posts. The internal name
        # (often one student's wording) is kept only in complaints_all for trends.
        return {
            "rank": i, "problem": d["title"] or clean(c.name),
            "area": c.area if c.area != "Other" else (d["area"] or "Other"),
            "students": len(c.students), "posts": c.posts,
            "trend": t, "previous_students": before, "summary": d["summary"], "points": d["points"],
            "request": d["request"],
        }

    report = {
        "week_start": week_start.isoformat(),
        "week_end": (week_start + timedelta(days=6)).isoformat(),
        "min_students": min_students,
        "topics": [topic_row(i, c) for i, c in enumerate(top_topics, 1)],
        "complaints": [complaint_row(i, c) for i, c in enumerate(top_complaints, 1)],
        "going_well": [
            {"name": clean(c.name), "students": len(c.students),
             **{k: v for k, v in details(topic_details, c).items() if k in ("summary", "points")}}
            for c in going_well
        ],
        "complaint_topics": [clean(c.name) for c in complaint_heavy],
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
        "described": {
            "topics": f"{sum(c.name in topic_details for c in to_describe)}/{len(to_describe)}",
            "complaints": f"{sum(c.name in complaint_details for c in top_complaints)}/{len(top_complaints)}",
        },
    }
    return report, stats
