"""Step 1: gather one week of public activity and strip identity before any LLM sees it.

What is read: feed posts, posts in PUBLIC clubs, and the anonymous board (all
including replies). What is never read: direct messages, club chat, private
clubs, deleted posts, posts by banned accounts.

The LLM receives only "P17 (S4, anonymous): <scrubbed text>". S4 is a per-run
pseudonym that exists so *code* can count distinct students; it is random each
run, never stored, and maps back to nobody outside this process. For anonymous
posts the author is read from anonymous_post_authors purely for that count —
an audited, server-side-only use (see CLAUDE.md privacy section).
"""
import random
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.anonymous_post_author import AnonymousPostAuthor
from app.models.club import Club
from app.models.post import Post
from app.models.user import User

MAX_CHARS = 400

# Titles students use for teaching staff (English, Bosnian, Turkish). A title
# followed by a capitalised word is treated as a person's name.
_TITLE = r"(?i:asst\.?\s+|assoc\.?\s+)?(?i:prof(?:essor)?|profesor(?:ica)?|dr|doc|docent|hoca|hocam)\.?"
_NAME = r"[A-ZČĆŽŠĐÇĞİÖŞÜ][\wčćžšđçğıöşü'\-]+"
STAFF_NAME_RE = re.compile(rf"\b{_TITLE}\s+{_NAME}(?:\s+{_NAME})?|\b{_NAME}\s+(?i:hoca|hocam)\b")
MENTION_RE = re.compile(r"@[A-Za-z0-9_.]+")
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
PHONE_RE = re.compile(r"(?<!\w)\+?\d[\d\s/-]{7,}\d")
URL_RE = re.compile(r"https?://\S+|www\.\S+")


@dataclass
class PulseItem:
    ref: str        # "P17" — the only post id the LLM ever sees
    student: str    # "S4"  — per-run pseudonym, used by code to count distinct students
    source: str     # "feed" | "club" | "anonymous"
    text: str       # de-identified content


@dataclass
class NameMatcher:
    """Matches any platform user's name. Full display names and usernames match
    case-insensitively; single name parts ("Amina") only when capitalised, so a
    display name like "Coffee Lover" can't wipe the word "coffee" from posts."""
    full: re.Pattern | None
    parts: re.Pattern | None

    def sub(self, text: str, repl: str = "someone") -> tuple[str, int]:
        hits = 0
        for pattern in (self.full, self.parts):
            if pattern is not None:
                text, n = pattern.subn(repl, text)
                hits += n
        return text, hits


def _alternation(words: set[str], flags: int = 0) -> re.Pattern | None:
    if not words:
        return None
    ordered = sorted(words, key=len, reverse=True)  # "Amina Hadžić" before "Amina"
    return re.compile(r"(?<!\w)(?:" + "|".join(map(re.escape, ordered)) + r")(?!\w)", flags)


def build_name_matcher(people: list[tuple[str, str]]) -> NameMatcher:
    # Usernames only when they can't be an ordinary word ("amina.h", "kerem_99"):
    # a username like "coffee" must not erase that word. @mentions of any
    # username are stripped separately by MENTION_RE.
    usernames = {u for u, _ in people if len(u) >= 3 and re.search(r"[._0-9]", u)}
    full_names = {d for _, d in people if len(d.split()) >= 2}
    parts = {p for _, d in people for p in d.split() if len(p) >= 3 and p[:1].isupper()}
    full = usernames | full_names
    return NameMatcher(full=_alternation(full, re.IGNORECASE), parts=_alternation(parts))


@dataclass
class Collected:
    items: list[PulseItem]
    students: int
    # Matches every user's name; none may appear in a finished report
    # (enforced again in pipeline.scrub_output).
    names: NameMatcher = field(default_factory=lambda: NameMatcher(None, None))


def week_bounds(week_start: date) -> tuple[datetime, datetime]:
    start = datetime.combine(week_start, time.min, tzinfo=timezone.utc)
    return start, start + timedelta(days=7)


def last_completed_week(now: datetime | None = None) -> date:
    now = now or datetime.now(timezone.utc)
    this_monday = (now - timedelta(days=now.weekday())).date()
    return this_monday - timedelta(days=7)


def deidentify(text: str, names: NameMatcher) -> str:
    """Remove anything that points at a person: staff names, @mentions, known
    student names, emails, phone numbers, links."""
    # Order matters: links and emails contain "@", so they go before @mentions.
    text = URL_RE.sub("[link]", text)
    text = EMAIL_RE.sub("[email]", text)
    text = MENTION_RE.sub("@someone", text)
    text = PHONE_RE.sub("[phone]", text)
    text = STAFF_NAME_RE.sub("a staff member", text)
    text, _ = names.sub(text)
    text = " ".join(text.split())
    return text[:MAX_CHARS]


async def collect_week(db: AsyncSession, week_start: date) -> Collected:
    start, end = week_bounds(week_start)
    author_id = func.coalesce(Post.author_id, AnonymousPostAuthor.user_id)
    rows = (await db.execute(
        select(Post.content, Post.post_type, author_id.label("author"))
        .outerjoin(AnonymousPostAuthor, AnonymousPostAuthor.post_id == Post.id)
        .outerjoin(Club, Club.id == Post.club_id)
        .join(User, User.id == author_id)
        .where(
            Post.created_at >= start,
            Post.created_at < end,
            Post.is_deleted.is_(False),
            User.is_active.is_(True),
            or_(
                Post.post_type == "feed",
                Post.post_type == "anonymous_qa",
                and_(Post.post_type == "club", Club.is_private.is_(False)),
            ),
        )
        .order_by(Post.created_at)
    )).all()

    people = [tuple(p) for p in (await db.execute(select(User.username, User.display_name))).all()]
    names = build_name_matcher(people)

    order = list({r.author for r in rows})
    random.shuffle(order)  # pseudonym numbers carry no information about who posted first
    pseudonym = {author: f"S{i + 1}" for i, author in enumerate(order)}

    items = []
    for i, r in enumerate(rows):
        text = deidentify(r.content or "", names)
        if not text.strip():
            continue
        source = {"feed": "feed", "club": "club", "anonymous_qa": "anonymous"}[r.post_type]
        items.append(PulseItem(ref=f"P{i + 1}", student=pseudonym[r.author], source=source, text=text))

    return Collected(items=items, students=len(pseudonym), names=names)
