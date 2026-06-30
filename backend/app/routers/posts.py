import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, case, func, literal, literal_column, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.database import get_db
from app.dependencies import get_current_user
from app.models.direct_message import DirectMessage
from app.models.follow import Follow
from app.models.poll import PollOption, PollVote
from app.models.post import Post
from app.models.user import User
from app.models.vote import Vote
from app.schemas.post import (
    AuthorInfo,
    CreatePostRequest,
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

    # Load expiry info from Post
    expiry_map = {
        row.id: row.poll_expires_at
        for row in (await db.execute(
            select(Post.id, Post.poll_expires_at).where(Post.id.in_(list(by_post.keys())))
        )).all()
    }

    now = datetime.now(timezone.utc)
    result: dict[uuid.UUID, PollResponse] = {}
    for post_id, opts in by_post.items():
        total = sum(vote_counts.get(o.id, 0) for o in opts)
        expires_at = expiry_map.get(post_id)
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        result[post_id] = PollResponse(
            options=[PollOptionResponse(id=o.id, text=o.text, votes=vote_counts.get(o.id, 0)) for o in opts],
            total_votes=total,
            user_vote_option_id=user_votes.get(post_id),
            expires_at=expires_at,
            is_expired=bool(expires_at and now > expires_at),
        )
    return result


def _row_to_response(row, current_vote: str | None, poll: PollResponse | None = None) -> PostResponse:
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
        is_deleted=post.is_deleted,
        is_pinned=post.is_pinned,
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

    return PostListResponse(
        posts=[_row_to_response(r, votes.get(r[0].id), polls.get(r[0].id)) for r in rows],
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

    vote_map = await _user_votes([post_id], current_user.id, db)
    poll_map = await _load_polls([post_id], current_user.id, db)
    post_response = _row_to_response(row, vote_map.get(post_id), poll_map.get(post_id))

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

    if not (
        await db.execute(
            select(Post.id).where(Post.id == post_id, Post.is_deleted == False)
        )
    ).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Post not found.")

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
    return await _vote_counts(post_id, current_user.id, db)


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
