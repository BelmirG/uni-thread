import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.database import get_db
from app.dependencies import get_current_user
from app.models.direct_message import DirectMessage
from app.models.follow import Follow
from app.models.post import Post
from app.models.user import User
from app.models.vote import Vote
from app.schemas.post import (
    AuthorInfo,
    CreatePostRequest,
    PostListResponse,
    PostResponse,
    VoteRequest,
    VoteResponse,
)

router = APIRouter(prefix="/api/posts", tags=["posts"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _build_post_select(extra_where=None, hot_score: bool = False):
    """Return a SELECT with aggregated vote + reply counts.

    When hot_score=True, appends a computed `hot_score` column so callers can
    simply use ORDER BY hot_score DESC.  PostgreSQL resolves a bare alias name
    in ORDER BY even when it's derived from aggregates; it does NOT resolve
    alias names used inside an expression (e.g. upvotes - downvotes fails).
    """
    ReplyAlias = aliased(Post)
    upvotes_col = func.count(case((Vote.vote_type == "up", 1))).label("upvotes")
    downvotes_col = func.count(case((Vote.vote_type == "down", 1))).label("downvotes")
    reply_count_col = func.count(ReplyAlias.id).label("reply_count")

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
        columns.append((
            (func.count(case((Vote.vote_type == "up", 1))) -
             func.count(case((Vote.vote_type == "down", 1))) +
             func.count(ReplyAlias.id) * 0.5 + 1) /
            func.power(age_hours + 2, 1.5)
        ).label("hot_score"))

    stmt = (
        select(*columns)
        .outerjoin(User, Post.author_id == User.id)
        .outerjoin(Vote, Vote.post_id == Post.id)
        .outerjoin(
            ReplyAlias,
            and_(ReplyAlias.parent_post_id == Post.id, ReplyAlias.is_deleted == False),
        )
        .group_by(Post.id, User.username, User.display_name, User.avatar_url)
    )
    if extra_where is not None:
        stmt = stmt.where(extra_where)
    return stmt


async def _user_votes(
    post_ids: list[uuid.UUID], user_id: uuid.UUID, db: AsyncSession
) -> dict[uuid.UUID, str]:
    """Batch-load the current user's vote for a list of post IDs."""
    if not post_ids:
        return {}
    result = await db.execute(
        select(Vote.post_id, Vote.vote_type).where(
            Vote.post_id.in_(post_ids), Vote.user_id == user_id
        )
    )
    return {row.post_id: row.vote_type for row in result}


def _row_to_response(row, current_vote: str | None) -> PostResponse:
    post, username, display_name, avatar_url, upvotes, downvotes, reply_count, share_count, *_ = row
    return PostResponse(
        id=post.id,
        content="[deleted]" if post.is_deleted else post.content,
        post_type=post.post_type,
        faculty_tag=post.faculty_tag,
        image_urls=post.image_urls or [],
        author=AuthorInfo(username=username, display_name=display_name, avatar_url=avatar_url) if username else None,
        upvotes=upvotes or 0,
        downvotes=downvotes or 0,
        current_user_vote=current_vote,
        reply_count=reply_count or 0,
        share_count=share_count or 0,
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
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    return PostResponse(
        id=post.id,
        content=post.content,
        post_type="feed",
        faculty_tag=post.faculty_tag,
        image_urls=post.image_urls or [],
        author=AuthorInfo(
            username=current_user.username,
            display_name=current_user.display_name,
            avatar_url=current_user.avatar_url,
        ),
        upvotes=0,
        downvotes=0,
        current_user_vote=None,
        reply_count=0,
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
    feed: str = "discover",   # "discover" | "friends"
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

    votes = await _user_votes([r[0].id for r in rows], current_user.id, db)
    return PostListResponse(
        posts=[_row_to_response(r, votes.get(r[0].id)) for r in rows],
        total=total,
    )


@router.get("/{post_id}")
async def get_post(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Main post
    row = (
        await db.execute(_build_post_select(Post.id == post_id))
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found.")

    vote_map = await _user_votes([post_id], current_user.id, db)
    post_response = _row_to_response(row, vote_map.get(post_id))

    # All descendants at any depth via recursive CTE
    seed = select(Post.id.label("id")).where(Post.parent_post_id == post_id)
    cte = seed.cte(name="descendants", recursive=True)
    step = select(Post.id.label("id")).join(cte, Post.parent_post_id == cte.c.id)
    cte = cte.union_all(step)

    reply_rows = (
        await db.execute(
            _build_post_select(Post.id.in_(select(cte.c.id)))
            .order_by(Post.created_at.asc())
        )
    ).all()

    reply_votes = await _user_votes([r[0].id for r in reply_rows], current_user.id, db)
    replies = [_row_to_response(r, reply_votes.get(r[0].id)) for r in reply_rows]

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
        club_id=parent.club_id,  # club posts require club_id on all rows incl. replies
        parent_post_id=post_id,
        image_urls=body.image_urls,
    )
    db.add(reply)
    await db.commit()
    await db.refresh(reply)

    return PostResponse(
        id=reply.id,
        content=reply.content,
        post_type=reply.post_type,
        image_urls=reply.image_urls or [],
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
            await db.delete(existing)          # same vote → toggle off
        else:
            existing.vote_type = body.vote_type  # opposite vote → switch
    else:
        db.add(Vote(post_id=post_id, user_id=current_user.id, vote_type=body.vote_type))

    await db.commit()
    return await _vote_counts(post_id, current_user.id, db)


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
