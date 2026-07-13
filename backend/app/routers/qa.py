import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, case, func, literal, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.notify import notify
from app.database import get_db
from app.dependencies import get_current_user
from app.models.anonymous_post_author import AnonymousPostAuthor
from app.models.bookmark import Bookmark
from app.models.post import Post
from app.models.user import User
from app.models.vote import Vote
from app.schemas.qa import CreateQAPostRequest, QAListResponse, QAPostResponse

router = APIRouter(prefix="/api/qa", tags=["qa"])


# ── helpers ───────────────────────────────────────────────────────────────────

_QA_DESCENDANT_COUNT = literal_column("""(
    WITH RECURSIVE d(id) AS (
        SELECT r.id FROM posts r
        WHERE r.parent_post_id = posts.id AND r.is_deleted = false
        UNION ALL
        SELECT p.id FROM posts p JOIN d ON p.parent_post_id = d.id
        WHERE p.is_deleted = false
    )
    SELECT COUNT(*) FROM d
)""")


def _build_qa_select(extra_where=None):
    """
    Select posts with aggregated vote + reply counts.
    Deliberately does NOT join the users table — author identity is never
    loaded, so it cannot accidentally appear in any serialized response.
    """
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
    stmt = select(Post, upvotes_col, downvotes_col, _QA_DESCENDANT_COUNT.label("reply_count"))
    if extra_where is not None:
        stmt = stmt.where(extra_where)
    return stmt


def _row_to_response(
    row, current_vote: str | None, is_own: bool = False, is_bookmarked: bool = False
) -> QAPostResponse:
    post, upvotes, downvotes, reply_count = row
    return QAPostResponse(
        id=post.id,
        content="[deleted]" if post.is_deleted else post.content,
        faculty_tag=post.faculty_tag,
        image_urls=post.image_urls or [],
        file_attachments=post.file_attachments or [],
        upvotes=upvotes or 0,
        downvotes=downvotes or 0,
        current_user_vote=current_vote,
        reply_count=reply_count or 0,
        created_at=post.created_at,
        is_deleted=post.is_deleted,
        parent_post_id=post.parent_post_id,
        is_own=is_own,
        is_bookmarked=is_bookmarked,
    )


async def _user_owns(
    post_ids: list[uuid.UUID], user_id: uuid.UUID, db: AsyncSession
) -> set[uuid.UUID]:
    if not post_ids:
        return set()
    result = await db.execute(
        select(AnonymousPostAuthor.post_id).where(
            AnonymousPostAuthor.post_id.in_(post_ids),
            AnonymousPostAuthor.user_id == user_id,
        )
    )
    return {row.post_id for row in result}


async def _user_bookmarks(
    post_ids: list[uuid.UUID], user_id: uuid.UUID, db: AsyncSession
) -> set[uuid.UUID]:
    # A bookmark is "this user saved this post" — it says nothing about who
    # wrote the post, so reading it here doesn't touch the privacy compartment.
    if not post_ids:
        return set()
    result = await db.execute(
        select(Bookmark.post_id).where(
            Bookmark.post_id.in_(post_ids), Bookmark.user_id == user_id
        )
    )
    return {row[0] for row in result}


async def _user_votes_for(
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


async def _vote_counts(
    post_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> dict:
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
    return {
        "upvotes": row.upvotes or 0,
        "downvotes": row.downvotes or 0,
        "current_user_vote": current,
    }


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED, response_model=QAPostResponse)
async def create_question(
    body: CreateQAPostRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Post an anonymous question.

    author_id is intentionally NULL — the posts table holds no trace of the
    real author. The real author is written to anonymous_post_authors in the
    same database transaction so moderation is always possible.
    """
    post = Post(
        author_id=None,        # ← no author in the posts table
        content=body.content,
        post_type="anonymous_qa",
        is_anonymous=True,
        faculty_tag=body.faculty_tag,
        image_urls=body.image_urls,
        file_attachments=[a.model_dump() for a in body.file_attachments],
    )
    db.add(post)
    await db.flush()  # generate post.id before committing

    # Privacy compartment: real author stored separately, never joined publicly
    db.add(AnonymousPostAuthor(post_id=post.id, user_id=current_user.id))
    await db.commit()
    await db.refresh(post)

    return QAPostResponse(
        id=post.id,
        content=post.content,
        faculty_tag=post.faculty_tag,
        image_urls=post.image_urls or [],
        file_attachments=post.file_attachments or [],
        upvotes=0,
        downvotes=0,
        current_user_vote=None,
        reply_count=0,
        created_at=post.created_at,
        is_deleted=False,
        parent_post_id=None,
        is_own=True,
    )


@router.get("", response_model=QAListResponse)
async def list_questions(
    limit: int = 20,
    offset: int = 0,
    faculty: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.constants import FACULTIES
    if faculty and faculty not in FACULTIES:
        raise HTTPException(status_code=422, detail="Invalid faculty tag.")

    where = and_(
        Post.post_type == "anonymous_qa",
        Post.parent_post_id.is_(None),
        Post.is_deleted == False,
        *([ Post.faculty_tag == faculty ] if faculty else []),
    )
    rows = (
        await db.execute(
            _build_qa_select(where).order_by(Post.created_at.desc()).limit(limit).offset(offset)
        )
    ).all()

    total = (await db.execute(select(func.count(Post.id)).where(where))).scalar() or 0
    post_ids = [r[0].id for r in rows]
    votes = await _user_votes_for(post_ids, current_user.id, db)
    owned = await _user_owns(post_ids, current_user.id, db)
    saved = await _user_bookmarks(post_ids, current_user.id, db)

    return QAListResponse(
        posts=[
            _row_to_response(r, votes.get(r[0].id), is_own=r[0].id in owned, is_bookmarked=r[0].id in saved)
            for r in rows
        ],
        total=total,
    )


@router.get("/{post_id}")
async def get_question(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (await db.execute(_build_qa_select(Post.id == post_id))).first()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found.")

    vote_map = await _user_votes_for([post_id], current_user.id, db)
    owned_q = await _user_owns([post_id], current_user.id, db)
    saved_q = await _user_bookmarks([post_id], current_user.id, db)
    question = _row_to_response(
        row, vote_map.get(post_id), is_own=post_id in owned_q, is_bookmarked=post_id in saved_q
    )

    MAX_DEPTH = 6
    seed = select(Post.id.label("id"), literal(0).label("depth")).where(Post.parent_post_id == post_id)
    cte = seed.cte(name="descendants", recursive=True)
    step = (
        select(Post.id.label("id"), (cte.c.depth + 1).label("depth"))
        .join(cte, Post.parent_post_id == cte.c.id)
        .where(cte.c.depth < MAX_DEPTH)
    )
    cte = cte.union_all(step)

    answer_rows = (
        await db.execute(
            _build_qa_select(Post.id.in_(select(cte.c.id))).order_by(Post.created_at.asc())
        )
    ).all()
    answer_ids = [r[0].id for r in answer_rows]
    answer_votes = await _user_votes_for(answer_ids, current_user.id, db)
    owned_a = await _user_owns(answer_ids, current_user.id, db)
    answers = [_row_to_response(r, answer_votes.get(r[0].id), is_own=r[0].id in owned_a) for r in answer_rows]

    return {"question": question, "answers": answers}


@router.post("/{post_id}/answers", status_code=status.HTTP_201_CREATED, response_model=QAPostResponse)
async def create_answer(
    post_id: uuid.UUID,
    body: CreateQAPostRequest,
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
    if parent.post_type != "anonymous_qa":
        raise HTTPException(status_code=400, detail="Can only answer Q&A posts here.")

    answer = Post(
        author_id=None,
        content=body.content,
        post_type="anonymous_qa",
        is_anonymous=True,
        parent_post_id=post_id,
        image_urls=body.image_urls,
        file_attachments=[a.model_dump() for a in body.file_attachments],
    )
    db.add(answer)
    await db.flush()

    db.add(AnonymousPostAuthor(post_id=answer.id, user_id=current_user.id))
    await db.commit()
    await db.refresh(answer)

    # Notify the question's author that an answer arrived — WITHOUT touching
    # anyone's identity. This is the one user-facing code path allowed to read
    # anonymous_post_authors, and it must uphold two invariants:
    #   1. The looked-up author id is used only as the notification RECIPIENT.
    #      It never appears in this response or any payload a client can see.
    #   2. The notification is actorless (actor=None): the answerer's identity
    #      is not stored on the row and not pushed over the WebSocket. Even the
    #      question author only learns "someone answered", never who.
    # The self-answer check below happens server-side, so its outcome (no
    # notification) is indistinguishable from the author simply not reacting.
    question_author_id = (await db.execute(
        select(AnonymousPostAuthor.user_id).where(AnonymousPostAuthor.post_id == parent.id)
    )).scalar_one_or_none()
    if question_author_id and question_author_id != current_user.id:
        await notify(
            db,
            user_id=question_author_id,
            type="qa_answer",
            actor=None,
            reference_id=parent.id,
            extra={"post_id": str(parent.id)},
        )

    return QAPostResponse(
        id=answer.id,
        content=answer.content,
        image_urls=answer.image_urls or [],
        file_attachments=answer.file_attachments or [],
        upvotes=0,
        downvotes=0,
        current_user_vote=None,
        reply_count=0,
        created_at=answer.created_at,
        is_deleted=False,
        parent_post_id=post_id,
        is_own=True,
    )


@router.post("/{post_id}/vote")
async def vote_post(
    post_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vote_type = body.get("vote_type")
    if vote_type not in ("up", "down"):
        raise HTTPException(status_code=422, detail="vote_type must be 'up' or 'down'.")

    if not (
        await db.execute(select(Post.id).where(Post.id == post_id, Post.is_deleted == False))
    ).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Post not found.")

    existing = (
        await db.execute(
            select(Vote).where(Vote.post_id == post_id, Vote.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if existing:
        if existing.vote_type == vote_type:
            await db.delete(existing)
        else:
            existing.vote_type = vote_type
    else:
        db.add(Vote(post_id=post_id, user_id=current_user.id, vote_type=vote_type))

    await db.commit()
    return await _vote_counts(post_id, current_user.id, db)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Only admins or the real author (looked up via anonymous_post_authors) can
    delete an anonymous post. Regular users cannot delete others' posts even
    if they happen to know the post ID.
    """
    post = (
        await db.execute(
            select(Post).where(Post.id == post_id, Post.is_deleted == False)
        )
    ).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")

    # Check authorship via the privacy table — not the posts table
    is_author = (
        await db.execute(
            select(AnonymousPostAuthor.post_id).where(
                AnonymousPostAuthor.post_id == post_id,
                AnonymousPostAuthor.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()

    if not is_author and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorised.")

    post.is_deleted = True
    post.deleted_at = datetime.now(timezone.utc)
    await db.commit()
