import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, case, func, literal, literal_column, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.mentions import extract_mention_usernames, notify_post_mentions
from app.core.notify import notify
from app.database import get_db
from app.dependencies import get_current_user
from app.models.bookmark import Bookmark
from app.models.club import Club
from app.models.club_member import ClubMember
from app.models.direct_message import DirectMessage
from app.models.follow import Follow
from app.models.poll import PollOption, PollVote
from app.models.post import Post
from app.models.user import User
from app.models.vote import Vote
from app.schemas.post import (
    AuthorInfo,
    CreatePostRequest,
    EditPostRequest,
    PollOptionResponse,
    PollResponse,
    PollVoteRequest,
    PostListResponse,
    PostResponse,
    VoteRequest,
    VoteResponse,
)

router = APIRouter(prefix="/api/posts", tags=["posts"])


# ── helpers ──────────────────────────────────────────────────────────────────

_DESCENDANT_COUNT = literal_column("""(
    WITH RECURSIVE d(id) AS (
        SELECT r.id FROM posts r
        WHERE r.parent_post_id = posts.id AND r.is_deleted = false
        UNION ALL
        SELECT p.id FROM posts p JOIN d ON p.parent_post_id = d.id
        WHERE p.is_deleted = false
    )
    SELECT COUNT(*) FROM d
)""")


def _build_post_select(extra_where=None, hot_score: bool = False):
    upvotes_col = (
        select(func.count())
        .where(and_(Vote.post_id == Post.id, Vote.vote_type == "up"))
        .correlate(Post)
        .scalar_subquery()
        .label("upvotes")
    )
    downvotes_col = (
        select(func.count())
        .where(and_(Vote.post_id == Post.id, Vote.vote_type == "down"))
        .correlate(Post)
        .scalar_subquery()
        .label("downvotes")
    )
    reply_count_col = _DESCENDANT_COUNT.label("reply_count")
    share_count_col = (
        select(func.count(DirectMessage.id))
        .where(DirectMessage.shared_post_id == Post.id)
        .correlate(Post)
        .scalar_subquery()
        .label("share_count")
    )
    columns = [Post, User.username, User.display_name, User.avatar_url, upvotes_col, downvotes_col, reply_count_col, share_count_col]

    if hot_score:
        age_hours = func.extract("epoch", func.now() - Post.created_at) / 3600.0
        up_sq = select(func.count()).where(and_(Vote.post_id == Post.id, Vote.vote_type == "up")).correlate(Post).scalar_subquery()
        down_sq = select(func.count()).where(and_(Vote.post_id == Post.id, Vote.vote_type == "down")).correlate(Post).scalar_subquery()
        columns.append((
            (up_sq - down_sq + _DESCENDANT_COUNT * 0.5 + 1) /
            func.power(age_hours + 2, 1.5)
        ).label("hot_score"))

    stmt = (
        select(*columns)
        .outerjoin(User, Post.author_id == User.id)
    )
    if extra_where is not None:
        stmt = stmt.where(extra_where)
    return stmt


async def _guard_private_club_post(post: Post, user_id: uuid.UUID, db: AsyncSession) -> None:
    """Block access to a post that lives in a private club the user hasn't joined.

    The club-scoped endpoints already enforce this, but the generic /api/posts/{id}
    read, reply, and vote routes are reachable by post id alone. Without this check a
    non-member who learns a private club post's id could read it, its replies, reply
    to it, or vote on it — a private-content leak. Returns 404 (not 403) so we don't
    even confirm the post exists to outsiders.
    """
    if post.post_type != "club" or post.club_id is None:
        return
    club = (await db.execute(select(Club).where(Club.id == post.club_id))).scalar_one_or_none()
    if club is None or not club.is_private:
        return
    member = (await db.execute(
        select(ClubMember.user_id).where(
            ClubMember.club_id == post.club_id, ClubMember.user_id == user_id
        )
    )).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Post not found.")


async def _user_votes(
    post_ids: list[uuid.UUID], user_id: uuid.UUID, db: AsyncSession
) -> dict[uuid.UUID, str]:
    if not post_ids:
        return {}
    result = await db.execute(
        select(Vote.post_id, Vote.vote_type).where(
            Vote.post_id.in_(post_ids), Vote.user_id == user_id
        )
    )
    return {row.post_id: row.vote_type for row in result}


async def _user_bookmarks(
    post_ids: list[uuid.UUID], user_id: uuid.UUID, db: AsyncSession
) -> set[uuid.UUID]:
    if not post_ids:
        return set()
    result = await db.execute(
        select(Bookmark.post_id).where(
            Bookmark.post_id.in_(post_ids), Bookmark.user_id == user_id
        )
    )
    return {row[0] for row in result}


async def _load_polls(
    post_ids: list[uuid.UUID], user_id: uuid.UUID, db: AsyncSession
) -> dict[uuid.UUID, PollResponse]:
    if not post_ids:
        return {}

    # Load all options for these posts
    options = (await db.execute(
        select(PollOption)
        .where(PollOption.post_id.in_(post_ids))
        .order_by(PollOption.post_id, PollOption.position)
    )).scalars().all()

    if not options:
        return {}

    option_ids = [o.id for o in options]

    # Vote counts per option
    vote_counts = {
        row.poll_option_id: row.cnt
        for row in (await db.execute(
            select(PollVote.poll_option_id, func.count(PollVote.id).label("cnt"))
            .where(PollVote.poll_option_id.in_(option_ids))
            .group_by(PollVote.poll_option_id)
        )).all()
    }

    # Current user's votes
    user_votes = {
        row.post_id: row.poll_option_id
        for row in (await db.execute(
            select(PollVote.post_id, PollVote.poll_option_id)
            .where(PollVote.post_id.in_(post_ids), PollVote.user_id == user_id)
        )).all()
    }

    # Group options by post
    from collections import defaultdict
    by_post: dict[uuid.UUID, list[PollOption]] = defaultdict(list)
    for o in options:
        by_post[o.post_id].append(o)

    # Load expiry + vote-visibility info from Post
    post_meta = {
        row.id: (row.poll_expires_at, row.poll_public_votes)
        for row in (await db.execute(
            select(Post.id, Post.poll_expires_at, Post.poll_public_votes)
            .where(Post.id.in_(list(by_post.keys())))
        )).all()
    }

    now = datetime.now(timezone.utc)
    result: dict[uuid.UUID, PollResponse] = {}
    for post_id, opts in by_post.items():
        total = sum(vote_counts.get(o.id, 0) for o in opts)
        expires_at, public_votes = post_meta.get(post_id, (None, False))
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        result[post_id] = PollResponse(
            options=[PollOptionResponse(id=o.id, text=o.text, votes=vote_counts.get(o.id, 0)) for o in opts],
            total_votes=total,
            user_vote_option_id=user_votes.get(post_id),
            expires_at=expires_at,
            is_expired=bool(expires_at and now > expires_at),
            public_votes=public_votes,
        )
    return result


def _row_to_response(
    row, current_vote: str | None, poll: PollResponse | None = None, is_bookmarked: bool = False
) -> PostResponse:
    post, username, display_name, avatar_url, upvotes, downvotes, reply_count, share_count, *_ = row
    return PostResponse(
        id=post.id,
        content="[deleted]" if post.is_deleted else post.content,
        post_type=post.post_type,
        faculty_tag=post.faculty_tag,
        image_urls=post.image_urls or [],
        file_attachments=post.file_attachments or [],
        author=AuthorInfo(username=username, display_name=display_name, avatar_url=avatar_url) if username else None,
        upvotes=upvotes or 0,
        downvotes=downvotes or 0,
        current_user_vote=current_vote,
        reply_count=reply_count or 0,
        share_count=share_count or 0,
        poll=poll,
        created_at=post.created_at,
        edited_at=post.edited_at,
        is_deleted=post.is_deleted,
        is_pinned=post.is_pinned,
        is_bookmarked=is_bookmarked,
        parent_post_id=post.parent_post_id,
    )


async def _vote_counts(
    post_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> VoteResponse:
    row = (
        await db.execute(
            select(
                func.count(case((Vote.vote_type == "up", 1))).label("upvotes"),
                func.count(case((Vote.vote_type == "down", 1))).label("downvotes"),
            ).where(Vote.post_id == post_id)
        )
    ).first()
    current = (
        await db.execute(
            select(Vote.vote_type).where(
                Vote.post_id == post_id, Vote.user_id == user_id
            )
        )
    ).scalar_one_or_none()
    return VoteResponse(
        upvotes=row.upvotes or 0,
        downvotes=row.downvotes or 0,
        current_user_vote=current,
    )


async def _create_poll_options(post_id: uuid.UUID, options: list[str], db: AsyncSession) -> None:
    for i, text in enumerate(options):
        db.add(PollOption(post_id=post_id, text=text.strip(), position=i))


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED, response_model=PostResponse)
async def create_post(
    body: CreatePostRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = Post(
        author_id=current_user.id,
        content=body.content,
        post_type="feed",
        faculty_tag=body.faculty_tag,
        image_urls=body.image_urls,
        file_attachments=[a.model_dump() for a in body.file_attachments],
        poll_expires_at=body.poll_expires_at,
    )
    db.add(post)
    await db.flush()

    poll = None
    if body.poll_options:
        await _create_poll_options(post.id, body.poll_options, db)
        await db.flush()
        polls = await _load_polls([post.id], current_user.id, db)
        poll = polls.get(post.id)

    await db.commit()
    await db.refresh(post)

    await notify_post_mentions(post.content, post, current_user, db)

    return PostResponse(
        id=post.id,
        content=post.content,
        post_type="feed",
        faculty_tag=post.faculty_tag,
        image_urls=post.image_urls or [],
        file_attachments=post.file_attachments or [],
        author=AuthorInfo(
            username=current_user.username,
            display_name=current_user.display_name,
            avatar_url=current_user.avatar_url,
        ),
        upvotes=0,
        downvotes=0,
        current_user_vote=None,
        reply_count=0,
        poll=poll,
        created_at=post.created_at,
        is_deleted=False,
        parent_post_id=None,
    )


@router.get("", response_model=PostListResponse)
async def list_posts(
    limit: int = 20,
    offset: int = 0,
    sort: str = "hot",
    faculty: str | None = None,
    feed: str = "discover",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.constants import FACULTIES
    if faculty and faculty not in FACULTIES:
        raise HTTPException(status_code=422, detail="Invalid faculty tag.")

    base_conditions = [
        Post.post_type == "feed",
        Post.parent_post_id.is_(None),
        Post.is_deleted == False,
        *([ Post.faculty_tag == faculty ] if faculty else []),
    ]

    if feed == "friends":
        following_subq = (
            select(Follow.following_id)
            .where(Follow.follower_id == current_user.id)
            .scalar_subquery()
        )
        where = and_(*base_conditions, Post.author_id.in_(following_subq))
        include_hot = False
        order = Post.created_at.desc()
    else:
        where = and_(*base_conditions)
        include_hot = sort == "hot"
        order = text("hot_score DESC") if include_hot else Post.created_at.desc()

    rows = (
        await db.execute(
            _build_post_select(where, hot_score=include_hot)
            .order_by(order)
            .limit(limit)
            .offset(offset)
        )
    ).all()

    total = (
        await db.execute(select(func.count(Post.id)).where(where))
    ).scalar() or 0

    post_ids = [r[0].id for r in rows]
    votes = await _user_votes(post_ids, current_user.id, db)
    polls = await _load_polls(post_ids, current_user.id, db)
    saved = await _user_bookmarks(post_ids, current_user.id, db)

    return PostListResponse(
        posts=[_row_to_response(r, votes.get(r[0].id), polls.get(r[0].id), r[0].id in saved) for r in rows],
        total=total,
    )


# Must be declared before /{post_id} so "search" isn't parsed as a post id.
@router.get("/search", response_model=PostListResponse)
async def search_posts(
    q: str = "",
    post_type: str = "feed",
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search top-level posts by content, newest first. Club posts are excluded:
    private club content must never surface in a global search."""
    q = q.strip()
    if post_type not in ("feed", "anonymous_qa"):
        raise HTTPException(status_code=422, detail="Invalid post type.")
    if not q:
        return PostListResponse(posts=[], total=0)

    where = and_(
        Post.post_type == post_type,
        Post.parent_post_id.is_(None),
        Post.is_deleted == False,
        Post.content.ilike(f"%{q}%"),
    )
    rows = (
        await db.execute(
            _build_post_select(where).order_by(Post.created_at.desc()).limit(min(limit, 50))
        )
    ).all()

    post_ids = [r[0].id for r in rows]
    votes = await _user_votes(post_ids, current_user.id, db)
    polls = await _load_polls(post_ids, current_user.id, db)
    saved = await _user_bookmarks(post_ids, current_user.id, db)

    return PostListResponse(
        posts=[_row_to_response(r, votes.get(r[0].id), polls.get(r[0].id), r[0].id in saved) for r in rows],
        total=len(rows),
    )


@router.get("/saved", response_model=PostListResponse)
async def list_saved_posts(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The current user's bookmarked posts, most recently saved first.

    Private-club posts are filtered out unless the user is still a member — a
    bookmark made while inside a club must not keep leaking content after leaving.
    """
    saved_order = (
        select(Bookmark.post_id, Bookmark.created_at)
        .where(Bookmark.user_id == current_user.id)
        .subquery()
    )
    still_visible = or_(
        Post.club_id.is_(None),
        ~Post.club_id.in_(select(Club.id).where(Club.is_private == True)),
        select(ClubMember.user_id)
        .where(ClubMember.club_id == Post.club_id, ClubMember.user_id == current_user.id)
        .exists(),
    )
    where = and_(Post.id == saved_order.c.post_id, Post.is_deleted == False, still_visible)

    total = (await db.execute(
        select(func.count()).select_from(
            select(Post.id).join(saved_order, Post.id == saved_order.c.post_id)
            .where(Post.is_deleted == False, still_visible).subquery()
        )
    )).scalar() or 0

    rows = (await db.execute(
        _build_post_select(where)
        .order_by(saved_order.c.created_at.desc())
        .limit(limit)
        .offset(offset)
    )).all()

    post_ids = [r[0].id for r in rows]
    votes = await _user_votes(post_ids, current_user.id, db)
    polls = await _load_polls(post_ids, current_user.id, db)

    return PostListResponse(
        posts=[_row_to_response(r, votes.get(r[0].id), polls.get(r[0].id), True) for r in rows],
        total=total,
    )


@router.get("/{post_id}")
async def get_post(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        await db.execute(_build_post_select(Post.id == post_id))
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found.")

    await _guard_private_club_post(row[0], current_user.id, db)

    vote_map = await _user_votes([post_id], current_user.id, db)
    poll_map = await _load_polls([post_id], current_user.id, db)
    saved_map = await _user_bookmarks([post_id], current_user.id, db)
    post_response = _row_to_response(row, vote_map.get(post_id), poll_map.get(post_id), post_id in saved_map)

    MAX_DEPTH = 6
    seed = select(Post.id.label("id"), literal(0).label("depth")).where(Post.parent_post_id == post_id)
    cte = seed.cte(name="descendants", recursive=True)
    step = (
        select(Post.id.label("id"), (cte.c.depth + 1).label("depth"))
        .join(cte, Post.parent_post_id == cte.c.id)
        .where(cte.c.depth < MAX_DEPTH)
    )
    cte = cte.union_all(step)

    reply_rows = (
        await db.execute(
            _build_post_select(Post.id.in_(select(cte.c.id)))
            .order_by(Post.created_at.asc())
        )
    ).all()

    reply_ids = [r[0].id for r in reply_rows]
    reply_votes = await _user_votes(reply_ids, current_user.id, db)
    reply_polls = await _load_polls(reply_ids, current_user.id, db)
    replies = [_row_to_response(r, reply_votes.get(r[0].id), reply_polls.get(r[0].id)) for r in reply_rows]

    return {"post": post_response, "replies": replies}


@router.post("/{post_id}/replies", status_code=status.HTTP_201_CREATED, response_model=PostResponse)
async def create_reply(
    post_id: uuid.UUID,
    body: CreatePostRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    parent = (
        await db.execute(
            select(Post).where(Post.id == post_id, Post.is_deleted == False)
        )
    ).scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail="Post not found.")

    await _guard_private_club_post(parent, current_user.id, db)

    reply = Post(
        author_id=current_user.id,
        content=body.content,
        post_type=parent.post_type,
        club_id=parent.club_id,
        parent_post_id=post_id,
        image_urls=body.image_urls,
        file_attachments=[a.model_dump() for a in body.file_attachments],
    )
    db.add(reply)
    await db.commit()
    await db.refresh(reply)

    # Mentions in a reply deep-link to the top-level thread so the notification
    # lands somewhere useful (only thread roots have their own route). Walk up the
    # parent chain — replies are capped at depth 6 so this is at most a few hops.
    thread_root = parent
    while thread_root.parent_post_id is not None:
        thread_root = (await db.execute(
            select(Post).where(Post.id == thread_root.parent_post_id)
        )).scalar_one()
    await notify_post_mentions(reply.content, thread_root, current_user, db)

    # Tell the parent's author someone replied — unless they replied to themselves,
    # or they're @mentioned in the reply (the mention notification already covers it).
    if parent.author_id and parent.author_id != current_user.id:
        parent_author = (await db.execute(
            select(User).where(User.id == parent.author_id)
        )).scalar_one_or_none()
        if parent_author and parent_author.username.lower() not in extract_mention_usernames(reply.content):
            await notify(
                db,
                user_id=parent.author_id,
                type="reply",
                actor=current_user,
                reference_id=thread_root.id,
                extra={"post_id": str(thread_root.id)},
            )

    return PostResponse(
        id=reply.id,
        content=reply.content,
        post_type=reply.post_type,
        image_urls=reply.image_urls or [],
        file_attachments=reply.file_attachments or [],
        author=AuthorInfo(
            username=current_user.username,
            display_name=current_user.display_name,
            avatar_url=current_user.avatar_url,
        ),
        upvotes=0,
        downvotes=0,
        current_user_vote=None,
        reply_count=0,
        created_at=reply.created_at,
        is_deleted=False,
        parent_post_id=post_id,
    )


@router.post("/{post_id}/vote", response_model=VoteResponse)
async def vote_post(
    post_id: uuid.UUID,
    body: VoteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.vote_type not in ("up", "down"):
        raise HTTPException(status_code=422, detail="vote_type must be 'up' or 'down'.")

    post = (
        await db.execute(
            select(Post).where(Post.id == post_id, Post.is_deleted == False)
        )
    ).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    await _guard_private_club_post(post, current_user.id, db)

    existing = (
        await db.execute(
            select(Vote).where(Vote.post_id == post_id, Vote.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if existing:
        if existing.vote_type == body.vote_type:
            await db.delete(existing)
        else:
            existing.vote_type = body.vote_type
    else:
        db.add(Vote(post_id=post_id, user_id=current_user.id, vote_type=body.vote_type))

    await db.commit()
    result = await _vote_counts(post_id, current_user.id, db)

    # Milestone notification: fires once per threshold, only when an upvote landed
    # (not when one was toggled off), never for votes on your own post. The stored
    # type encodes the threshold ("milestone_10") so the existence check is exact.
    MILESTONES = (5, 10, 25, 50, 100)
    if (
        result.current_user_vote == "up"
        and result.upvotes in MILESTONES
        and post.author_id
        and post.author_id != current_user.id
    ):
        from app.models.notification import Notification
        mtype = f"milestone_{result.upvotes}"
        already = (await db.execute(
            select(Notification.id).where(
                Notification.user_id == post.author_id,
                Notification.type == mtype,
                Notification.reference_id == post.id,
            )
        )).first()
        if not already:
            await notify(
                db,
                user_id=post.author_id,
                type=mtype,
                actor=None,  # many people voted — no single actor
                reference_id=post.id,
                payload_type="milestone",
                extra={"count": result.upvotes, "post_id": str(post.id)},
            )

    return result


@router.post("/{post_id}/poll-vote")
async def poll_vote(
    post_id: uuid.UUID,
    body: PollVoteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = (await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False)
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    await _guard_private_club_post(post, current_user.id, db)

    now = datetime.now(timezone.utc)
    if post.poll_expires_at:
        expires = post.poll_expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if now > expires:
            raise HTTPException(status_code=400, detail="This poll has expired.")

    option = (await db.execute(
        select(PollOption).where(PollOption.id == body.option_id, PollOption.post_id == post_id)
    )).scalar_one_or_none()
    if not option:
        raise HTTPException(status_code=404, detail="Poll option not found.")

    existing = (await db.execute(
        select(PollVote).where(PollVote.post_id == post_id, PollVote.user_id == current_user.id)
    )).scalar_one_or_none()

    if existing:
        if existing.poll_option_id == body.option_id:
            await db.delete(existing)
        else:
            existing.poll_option_id = body.option_id
    else:
        db.add(PollVote(post_id=post_id, poll_option_id=body.option_id, user_id=current_user.id))

    await db.commit()

    polls = await _load_polls([post_id], current_user.id, db)
    return polls.get(post_id)


@router.get("/{post_id}/poll-voters")
async def poll_voters(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Who voted for what — ONLY for polls created with public_votes, where
    every voter saw the 'votes visible' label before voting. Anonymous polls
    (the default, and every poll that predates this feature) refuse here:
    vote identities for them must never leave the database."""
    post = (await db.execute(
        select(Post).where(Post.id == post_id, Post.is_deleted == False)
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if not post.poll_public_votes:
        raise HTTPException(status_code=403, detail="Votes on this poll are anonymous.")
    await _guard_private_club_post(post, current_user.id, db)

    options = (await db.execute(
        select(PollOption)
        .where(PollOption.post_id == post_id)
        .order_by(PollOption.position)
    )).scalars().all()

    voter_rows = (await db.execute(
        select(PollVote.poll_option_id, User.username, User.display_name, User.avatar_url)
        .join(User, User.id == PollVote.user_id)
        .where(PollVote.post_id == post_id)
        .order_by(User.display_name.asc())
    )).all()

    by_option: dict[uuid.UUID, list[dict]] = {}
    for option_id, username, display_name, avatar_url in voter_rows:
        by_option.setdefault(option_id, []).append({
            "username": username,
            "display_name": display_name,
            "avatar_url": avatar_url,
        })

    return [
        {"option_id": str(o.id), "text": o.text, "voters": by_option.get(o.id, [])}
        for o in options
    ]


@router.patch("/{post_id}")
async def edit_post(
    post_id: uuid.UUID,
    body: EditPostRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Author-only content edit. Sets edited_at so the UI can show an 'edited' badge.
    Attachments, polls, and post type are immutable — only the text changes."""
    post = (
        await db.execute(
            select(Post).where(Post.id == post_id, Post.is_deleted == False)
        )
    ).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own posts.")

    new_content = body.content.strip()
    if new_content != post.content:
        # Notify only people who weren't mentioned before this edit — no duplicate pings.
        from app.core.mentions import extract_mention_usernames
        old_names = extract_mention_usernames(post.content)
        post.content = new_content
        post.edited_at = datetime.now(timezone.utc)
        await db.commit()

        added = extract_mention_usernames(new_content) - old_names
        if added:
            thread_root = post
            while thread_root.parent_post_id is not None:
                thread_root = (await db.execute(
                    select(Post).where(Post.id == thread_root.parent_post_id)
                )).scalar_one()
            await notify_post_mentions(" ".join(f"@{n}" for n in added), thread_root, current_user, db)

    return {"content": post.content, "edited_at": post.edited_at.isoformat() if post.edited_at else None}


@router.post("/{post_id}/bookmark")
async def toggle_bookmark(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle save/un-save. Same pattern as voting: acting twice undoes the action."""
    post = (
        await db.execute(
            select(Post).where(Post.id == post_id, Post.is_deleted == False)
        )
    ).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    await _guard_private_club_post(post, current_user.id, db)

    existing = (
        await db.execute(
            select(Bookmark).where(Bookmark.post_id == post_id, Bookmark.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if existing:
        await db.delete(existing)
        bookmarked = False
    else:
        db.add(Bookmark(post_id=post_id, user_id=current_user.id))
        bookmarked = True

    await db.commit()
    return {"is_bookmarked": bookmarked}


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = (
        await db.execute(
            select(Post).where(Post.id == post_id, Post.is_deleted == False)
        )
    ).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post.author_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="You can only delete your own posts.")

    post.is_deleted = True
    post.deleted_at = datetime.now(timezone.utc)
    await db.commit()
