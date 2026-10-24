"""Campus Pulse: privacy guarantees and report logic (with a deterministic fake LLM)."""
import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select

from app.config import settings
from app.core.pulse import runner
from app.core.pulse.collect import build_name_matcher, collect_week, deidentify
from app.models.admin_action import AdminAction
from app.models.anonymous_post_author import AnonymousPostAuthor
from app.models.chat_message import ChatMessage
from app.models.club import Club
from app.models.conversation import Conversation
from app.models.direct_message import DirectMessage
from app.models.post import Post
from app.models.pulse_report import PulseReport
from app.models.user import User


RULES = [  # keyword -> (topic, complaint or None, sentiment, area)
    ("wifi", "Campus Wi-Fi", "Library Wi-Fi keeps disconnecting", "neg", "IT & Wi-Fi"),
    ("parking", "Parking", "Not enough parking spaces", "neg", "Facilities"),
    ("festival", "Spring Festival", None, "pos", None),
]


class FakeLLM:
    """Keyword rules instead of a model, so tests are fast and exact."""
    name = "fake"

    def __init__(self, summary: str = "Students discussed this topic.", extra_topics: list[str] | None = None):
        self.summary = summary
        self.extra_topics = extra_topics or []
        self.seen_inputs: list[str] = []

    async def json_chat(self, system: str, user: str, schema: dict) -> dict:
        self.seen_inputs.append(user)
        if system.startswith("TASK: discover"):
            text = user.lower()
            hits = [r for r in RULES if r[0] in text]
            return {"topics": [r[1] for r in hits] + self.extra_topics, "complaints": [r[2] for r in hits if r[2]]}
        if system.startswith("TASK: consolidate"):
            topics = [l[2:] for l in user.split("CANDIDATE TOPICS:\n", 1)[1].split("\n\n")[0].splitlines() if l.startswith("- ")]
            complaints = [l[2:] for l in user.split("CANDIDATE COMPLAINTS:\n", 1)[1].splitlines() if l.startswith("- ")]
            area = {r[2]: r[4] for r in RULES if r[2]}
            return {"topics": topics, "complaints": [{"problem": c, "area": area.get(c, "Other")} for c in complaints]}
        if system.startswith("TASK: summarize"):
            keys = [l.split(" — ")[0] for l in user.splitlines() if " — " in l and l[:1] in "TCG"]
            return {"summaries": [{"key": k, "summary": self.summary} for k in keys]}
        raise AssertionError(f"unexpected prompt: {system[:40]}")

    async def text_chat(self, system: str, user: str) -> str:
        self.seen_inputs.append(user)
        assert system.startswith("TASK: assign"), system[:40]

        def numbered(section: str) -> dict[str, int]:
            block = user.split(f"{section}:\n", 1)[1].split("\n\n")[0]
            return {line.split(". ", 1)[1]: int(line.split(".", 1)[0]) for line in block.splitlines()}
        topics, complaints = numbered("TOPICS"), numbered("COMPLAINTS")
        lines = ["Here you go:"]  # chatter around the answer must be ignored, not break parsing
        for line in user.split("POSTS:\n", 1)[1].splitlines():
            ref, text = line.split(" ", 1)
            rule = next((r for r in RULES if r[0] in text.lower()), None)
            t = topics.get(rule[1], 0) if rule else 0
            c = complaints.get(rule[2], 0) if rule and rule[2] else 0
            lines.append(f"{ref} {t} {c} {rule[3] if rule else 'neu'}")
        return "\n".join(lines)


_week_counter = iter(range(1, 500))


def _fresh_week() -> date:
    """Each test gets its own Monday in 2020, so tests never see each other's posts."""
    return date(2020, 1, 6) + timedelta(weeks=next(_week_counter))


def _in_week(week: date, day: int = 2) -> datetime:
    return datetime.combine(week + timedelta(days=day), time(12), tzinfo=timezone.utc)


async def _post(db, author, content, when, *, post_type="feed", club=None, anon=False, deleted=False):
    p = Post(
        id=uuid.uuid4(), author_id=None if anon else author.id, content=content, post_type=post_type,
        club_id=club.id if club else None, is_anonymous=anon, is_deleted=deleted, created_at=when,
    )
    db.add(p)
    await db.flush()
    if anon:
        db.add(AnonymousPostAuthor(post_id=p.id, user_id=author.id))
    await db.commit()
    return p


async def _club(db, owner, *, private: bool) -> Club:
    c = Club(name=f"Club {uuid.uuid4().hex[:8]}", slug=f"c-{uuid.uuid4().hex[:8]}",
             description="x", created_by=owner.id, is_private=private)
    db.add(c)
    await db.commit()
    return c


async def _students(make_user, n):
    return [await make_user() for _ in range(n)]


# ── what is read ──────────────────────────────────────────────────────────────

async def test_collects_only_public_sources(make_user, db):
    week = _fresh_week()
    u, other = await make_user(), await make_user()
    banned = await make_user(is_active=False)
    public, private = await _club(db, u, private=False), await _club(db, u, private=True)
    when = _in_week(week)

    await _post(db, u, "MARK-feed", when)
    await _post(db, u, "MARK-public-club", when, post_type="club", club=public)
    await _post(db, u, "MARK-anon", when, post_type="anonymous_qa", anon=True)
    await _post(db, u, "MARK-private-club", when, post_type="club", club=private)
    await _post(db, u, "MARK-deleted", when, deleted=True)
    await _post(db, banned, "MARK-banned", when)
    await _post(db, u, "MARK-last-week", when - timedelta(days=7))
    conv = Conversation(user1_id=min(u.id, other.id, key=str), user2_id=max(u.id, other.id, key=str))
    db.add(conv)
    await db.flush()
    db.add(DirectMessage(conversation_id=conv.id, sender_id=u.id, content="MARK-dm", created_at=when))
    db.add(ChatMessage(club_id=public.id, author_id=u.id, content="MARK-chat", created_at=when))
    await db.commit()

    texts = " ".join(i.text for i in (await collect_week(db, week)).items)
    for wanted in ("MARK-feed", "MARK-public-club", "MARK-anon"):
        assert wanted in texts
    for never in ("MARK-private-club", "MARK-deleted", "MARK-banned", "MARK-last-week", "MARK-dm", "MARK-chat"):
        assert never not in texts, f"{never} must never reach the report"


def test_deidentify_strips_people_but_keeps_ordinary_words():
    names = build_name_matcher([
        ("amina.h", "Amina Hadžić"),
        ("coffee", "Coffee Lover"),   # a display name made of ordinary words
    ])
    out = deidentify(
        "Amina Hadžić and Amina said Prof. Kovačević and Ahmet hoca were late, "
        "mail amina@example.com or +000 00 000 000, see https://x.y @amina.h — "
        "the coffee in the cafeteria is cold",
        names,
    )
    for leaked in ("Amina", "Hadžić", "Kovačević", "Ahmet", "@amina.h", "amina@", "000 00", "https://"):
        assert leaked not in out
    assert "coffee" in out, "a display name like 'Coffee Lover' must not erase the word coffee"


# ── privacy rules enforced in code ────────────────────────────────────────────

async def test_threshold_is_enforced_in_code_not_by_the_model(make_user, db, monkeypatch):
    monkeypatch.setattr(settings, "pulse_min_students", 10)
    week = _fresh_week()
    when = _in_week(week)
    for s in await _students(make_user, 10):
        await _post(db, s, "the library wifi dropped again", when)
    for s in await _students(make_user, 9):
        await _post(db, s, "no parking near the main building", when)

    await runner.run_report(week, FakeLLM())
    row = (await db.execute(select(PulseReport).where(PulseReport.week_start == week))).scalar_one()
    problems = [c["problem"] for c in row.report["complaints"]]
    assert row.status == "done"
    assert "Library Wi-Fi keeps disconnecting" in problems          # 10 students: shown
    assert "Not enough parking spaces" not in problems              # 9 students: withheld
    assert row.report["hidden_below_threshold"]["complaints"] >= 1


async def test_one_student_posting_many_times_cannot_reach_the_threshold(make_user, db, monkeypatch):
    monkeypatch.setattr(settings, "pulse_min_students", 10)
    week = _fresh_week()
    spammer = await make_user()
    for i in range(15):
        await _post(db, spammer, f"wifi is broken {i}", _in_week(week))

    await runner.run_report(week, FakeLLM())
    row = (await db.execute(select(PulseReport).where(PulseReport.week_start == week))).scalar_one()
    assert row.report["complaints"] == []
    assert row.report["topics"] == []


async def test_report_never_contains_names_even_if_the_model_writes_them(make_user, db, monkeypatch):
    monkeypatch.setattr(settings, "pulse_min_students", 3)
    week = _fresh_week()
    named = User(email=f"{uuid.uuid4().hex[:8]}@example.com", username=f"amina.{uuid.uuid4().hex[:6]}",
                 display_name="Amina Hadžić", password_hash="x", is_email_verified=True)
    db.add(named)
    await db.commit()
    for s in await _students(make_user, 3):
        await _post(db, s, "wifi in the library again", _in_week(week))

    leaky = FakeLLM(summary="Amina Hadžić and Prof. Kovačević said the Wi-Fi is bad.")
    await runner.run_report(week, leaky)
    row = (await db.execute(select(PulseReport).where(PulseReport.week_start == week))).scalar_one()
    blob = str(row.report)
    assert "Amina" not in blob and "Hadžić" not in blob and "Kovačević" not in blob
    assert row.stats["redactions"] > 0


async def test_model_never_sees_who_posted(make_user, db, monkeypatch):
    monkeypatch.setattr(settings, "pulse_min_students", 1)
    week = _fresh_week()
    author = await make_user()
    await _post(db, author, "festival was great, thanks @" + author.username, _in_week(week),
                post_type="anonymous_qa", anon=True)
    llm = FakeLLM()
    await runner.run_report(week, llm)
    sent = "\n".join(llm.seen_inputs)
    assert author.username not in sent
    assert str(author.id) not in sent


def test_mood_reflects_a_clear_lean_not_a_strict_majority():
    from collections import Counter

    from app.core.pulse.pipeline import mood
    assert mood(Counter(positive=4, neutral=3)) == "positive"      # event: excitement + questions
    assert mood(Counter(negative=5, neutral=4, positive=1)) == "negative"
    assert mood(Counter(positive=3, negative=3, neutral=4)) == "mixed"
    assert mood(Counter(neutral=8, positive=1, negative=1)) == "neutral"


async def test_vague_catch_all_topics_are_never_ranked(make_user, db, monkeypatch):
    monkeypatch.setattr(settings, "pulse_min_students", 3)
    week = _fresh_week()
    for s in await _students(make_user, 4):
        await _post(db, s, "wifi again", _in_week(week))
    await runner.run_report(week, FakeLLM(extra_topics=["None", "Student Life", "Other"]))
    row = (await db.execute(select(PulseReport).where(PulseReport.week_start == week))).scalar_one()
    names = {t["name"].casefold() for t in row.report["topics"]}
    assert names.isdisjoint({"none", "student life", "other"})
    assert "campus wi-fi" in names


async def test_trend_compares_with_previous_week(make_user, db, monkeypatch):
    monkeypatch.setattr(settings, "pulse_min_students", 3)
    week1 = _fresh_week()
    week2 = week1 + timedelta(days=7)
    _fresh_week()  # reserve week2 so no other test uses it
    for s in await _students(make_user, 3):
        await _post(db, s, "wifi down", _in_week(week1))
    for s in await _students(make_user, 6):
        await _post(db, s, "wifi down again", _in_week(week2))

    await runner.run_report(week1, FakeLLM())
    await runner.run_report(week2, FakeLLM())
    row = (await db.execute(select(PulseReport).where(PulseReport.week_start == week2))).scalar_one()
    wifi = next(c for c in row.report["complaints"] if c["problem"] == "Library Wi-Fi keeps disconnecting")
    assert wifi["trend"] == "rising" and wifi["previous_students"] == 3


async def test_failed_model_marks_report_failed_not_stuck(make_user, db):
    class Broken(FakeLLM):
        async def json_chat(self, *a, **k):
            raise RuntimeError("model unavailable")

    week = _fresh_week()
    await _post(db, await make_user(), "anything", _in_week(week))
    await runner.run_report(week, Broken())
    row = (await db.execute(select(PulseReport).where(PulseReport.week_start == week))).scalar_one()
    assert row.status == "failed" and "model unavailable" in row.error


# ── API access ────────────────────────────────────────────────────────────────

async def test_api_is_invisible_when_disabled(client_for, make_user, monkeypatch):
    monkeypatch.setattr(settings, "pulse_enabled", False)
    admin = await make_user(is_admin=True)
    for c in (client_for(None), client_for(admin)):
        assert (await c.get("/api/admin/pulse/reports")).status_code == 404


async def test_api_is_admin_only(client_for, make_user, monkeypatch):
    monkeypatch.setattr(settings, "pulse_enabled", True)
    assert (await client_for(None).get("/api/admin/pulse/reports")).status_code == 401
    assert (await client_for(await make_user()).get("/api/admin/pulse/reports")).status_code == 403
    assert (await client_for(await make_user(is_admin=True)).get("/api/admin/pulse/reports")).status_code == 200


async def test_generate_validates_week_and_is_audited(client_for, make_user, db, monkeypatch):
    monkeypatch.setattr(settings, "pulse_enabled", True)
    started = []

    async def fake_start(week, llm=None):
        started.append(week)
        return True

    monkeypatch.setattr(runner, "start_generation", fake_start)
    admin = await make_user(is_admin=True)
    c = client_for(admin)

    assert (await c.post("/api/admin/pulse/generate", json={"week_start": "2026-10-14"})).status_code == 422  # a Wednesday
    future_monday = (datetime.now(timezone.utc) + timedelta(days=7 - datetime.now(timezone.utc).weekday())).date()
    assert (await c.post("/api/admin/pulse/generate", json={"week_start": future_monday.isoformat()})).status_code == 422

    r = await c.post("/api/admin/pulse/generate", json={})
    assert r.status_code == 202 and len(started) == 1
    logged = (await db.execute(select(AdminAction).where(
        AdminAction.action == "generate_pulse_report", AdminAction.actor_username == admin.username,
    ))).scalar_one_or_none()
    assert logged is not None
