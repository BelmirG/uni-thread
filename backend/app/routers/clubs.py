import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.database import get_db
from app.dependencies import get_current_user
from app.models.club import Club
from app.models.club_invitation import ClubInvitation
from app.models.club_join_request import ClubJoinRequest
from app.models.club_member import ClubMember
from app.models.post import Post
from app.models.user import User
from app.models.vote import Vote
from app.schemas.club import ClubListResponse, ClubResponse, CreateClubRequest
from app.schemas.post import (
    AuthorInfo,
    CreatePostRequest,
    PostListResponse,
    PostResponse,
    VoteRequest,
    VoteResponse,
)

router = APIRouter(prefix="/api/clubs", tags=["clubs"])


# ── slug helpers ──────────────────────────────────────────────────────────────

def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:100]
    return slug or "club"


async def _unique_slug(base: str, db: AsyncSession) -> str:
    slug = base
    n = 2
    while (
        await db.execute(select(Club.id).where(Club.slug == slug))
    ).scalar_one_or_none():
        slug = f"{base}-{n}"
        n += 1
    return slug


# ── post query helpers (same pattern as posts router) ─────────────────────────

def _build_post_select(extra_where=None):
    ReplyAlias = aliased(Post)
    stmt = (
        select(
            Post,
            User.username,
            User.display_name,
            User.avatar_url,
            func.count(case((Vote.vote_type == "up", 1))).label("upvotes"),
            func.count(case((Vote.vote_type == "down", 1))).label("downvotes"),
            func.count(ReplyAlias.id).label("reply_count"),
        )
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
    if not post_ids:
        return {}
    result = await db.execute(
        select(Vote.post_id, Vote.vote_type).where(
            Vote.post_id.in_(post_ids), Vote.user_id == user_id
        )
    )
    return {row.post_id: row.vote_type for row in result}


def _row_to_post(row, current_vote: str | None) -> PostResponse:
    post, username, display_name, avatar_url, upvotes, downvotes, reply_count = row
    return PostResponse(
        id=post.id,
        content="[deleted]" if post.is_deleted else post.content,
        post_type=post.post_type,
        image_urls=post.image_urls or [],
        author=AuthorInfo(username=username, display_name=display_name, avatar_url=avatar_url) if username else None,
        upvotes=upvotes or 0,
        downvotes=downvotes or 0,
        current_user_vote=current_vote,
        reply_count=reply_count or 0,
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


# ── club query helper ─────────────────────────────────────────────────────────

def _build_club_select(user_id: uuid.UUID, extra_where=None):
    """
    Returns rows of (Club, member_count, user_role, pending_request_id).
    pending_request_id is non-NULL when the current user has a pending join request.
    """
    AllMembers = aliased(ClubMember)
    UserMember = aliased(ClubMember)
    UserRequest = aliased(ClubJoinRequest)
    stmt = (
        select(
            Club,
            func.count(AllMembers.user_id).label("member_count"),
            UserMember.role.label("user_role"),
            UserRequest.id.label("pending_request_id"),
        )
        .outerjoin(AllMembers, AllMembers.club_id == Club.id)
        .outerjoin(
            UserMember,
            and_(UserMember.club_id == Club.id, UserMember.user_id == user_id),
        )
        .outerjoin(
            UserRequest,
            and_(UserRequest.club_id == Club.id, UserRequest.user_id == user_id),
        )
        .group_by(Club.id, UserMember.role, UserRequest.id)
    )
    if extra_where is not None:
        stmt = stmt.where(extra_where)
    return stmt


def _row_to_club(row) -> ClubResponse:
    club, member_count, user_role, pending_request_id = row
    return ClubResponse(
        id=club.id,
        name=club.name,
        slug=club.slug,
        description=club.description,
        is_private=club.is_private,
        member_count=member_count or 0,
        is_member=user_role is not None,
        role=user_role,
        has_pending_request=pending_request_id is not None,
        created_at=club.created_at,
    )


async def _get_join_request(
    club_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> ClubJoinRequest | None:
    return (
        await db.execute(
            select(ClubJoinRequest).where(
                ClubJoinRequest.club_id == club_id,
                ClubJoinRequest.user_id == user_id,
            )
        )
    ).scalar_one_or_none()


async def _get_club_or_404(slug: str, db: AsyncSession) -> Club:
    club = (
        await db.execute(select(Club).where(Club.slug == slug))
    ).scalar_one_or_none()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found.")
    return club


async def _get_membership(
    club_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> ClubMember | None:
    return (
        await db.execute(
            select(ClubMember).where(
                ClubMember.club_id == club_id, ClubMember.user_id == user_id
            )
        )
    ).scalar_one_or_none()


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED, response_model=ClubResponse)
async def create_club(
    body: CreateClubRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base_slug = _slugify(body.name)
    slug = await _unique_slug(base_slug, db)

    club = Club(
        name=body.name,
        slug=slug,
        description=body.description or None,
        is_private=body.is_private,
        created_by=current_user.id,
    )
    db.add(club)
    await db.flush()  # get club.id before inserting the owner row

    db.add(ClubMember(club_id=club.id, user_id=current_user.id, role="owner"))
    await db.commit()
    await db.refresh(club)

    return ClubResponse(
        id=club.id,
        name=club.name,
        slug=club.slug,
        description=club.description,
        is_private=club.is_private,
        member_count=1,
        is_member=True,
        role="owner",
        has_pending_request=False,
        created_at=club.created_at,
    )


@router.get("", response_model=ClubListResponse)
async def list_clubs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        await db.execute(
            _build_club_select(current_user.id).order_by(Club.created_at.desc())
        )
    ).all()
    total = (await db.execute(select(func.count(Club.id)))).scalar() or 0
    return ClubListResponse(clubs=[_row_to_club(r) for r in rows], total=total)


@router.get("/invitations/me")
async def my_invitations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    InvitedBy = aliased(User)
    rows = (
        await db.execute(
            select(ClubInvitation, Club, InvitedBy)
            .join(Club, Club.id == ClubInvitation.club_id)
            .join(InvitedBy, InvitedBy.id == ClubInvitation.invited_by)
            .where(ClubInvitation.invited_user_id == current_user.id)
            .order_by(ClubInvitation.created_at.desc())
        )
    ).all()
    return [
        {
            "club_name": club.name,
            "club_slug": club.slug,
            "invited_by_display_name": inviter.display_name,
            "invited_by_username": inviter.username,
            "created_at": inv.created_at,
        }
        for inv, club, inviter in rows
    ]


@router.get("/{slug}", response_model=ClubResponse)
async def get_club(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        await db.execute(_build_club_select(current_user.id, Club.slug == slug))
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Club not found.")
    return _row_to_club(row)


@router.post("/{slug}/join", response_model=ClubResponse)
async def join_club(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)

    if await _get_membership(club.id, current_user.id, db):
        raise HTTPException(status_code=409, detail="You are already a member.")

    if club.is_private:
        # Private clubs require owner approval — create a join request instead
        if await _get_join_request(club.id, current_user.id, db):
            raise HTTPException(status_code=409, detail="You already have a pending join request.")
        db.add(ClubJoinRequest(club_id=club.id, user_id=current_user.id))
    else:
        db.add(ClubMember(club_id=club.id, user_id=current_user.id, role="member"))

    await db.commit()

    row = (await db.execute(_build_club_select(current_user.id, Club.slug == slug))).first()
    return _row_to_club(row)


@router.delete("/{slug}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_club(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)
    membership = await _get_membership(club.id, current_user.id, db)
    if not membership:
        raise HTTPException(status_code=404, detail="You are not a member of this club.")

    if membership.role == "owner":
        # Check if there are other members who can take over
        successor = (
            await db.execute(
                select(ClubMember)
                .where(
                    ClubMember.club_id == club.id,
                    ClubMember.user_id != current_user.id,
                )
                .order_by(
                    case(
                        (ClubMember.role == "owner", 0),
                        (ClubMember.role == "moderator", 1),
                        else_=2,
                    ),
                    ClubMember.joined_at.asc(),
                )
                .limit(1)
            )
        ).scalar_one_or_none()

        if not successor:
            raise HTTPException(
                status_code=400,
                detail="You are the only member. Delete the club instead of leaving.",
            )

        # Promote the successor only if there is no other owner
        if successor.role != "owner":
            successor.role = "owner"

    await db.delete(membership)
    await db.commit()


@router.get("/{slug}/posts", response_model=PostListResponse)
async def get_club_posts(
    slug: str,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)

    if club.is_private:
        membership = await _get_membership(club.id, current_user.id, db)
        if not membership:
            raise HTTPException(status_code=403, detail="This is a private club.")

    where = and_(
        Post.post_type == "club",
        Post.club_id == club.id,
        Post.parent_post_id.is_(None),
        Post.is_deleted == False,
    )
    rows = (
        await db.execute(
            _build_post_select(where)
            .order_by(Post.is_pinned.desc(), Post.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    total = (await db.execute(select(func.count(Post.id)).where(where))).scalar() or 0
    votes = await _user_votes([r[0].id for r in rows], current_user.id, db)

    return PostListResponse(
        posts=[_row_to_post(r, votes.get(r[0].id)) for r in rows],
        total=total,
    )


@router.post("/{slug}/posts", status_code=status.HTTP_201_CREATED, response_model=PostResponse)
async def create_club_post(
    slug: str,
    body: CreatePostRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)
    membership = await _get_membership(club.id, current_user.id, db)
    if not membership:
        raise HTTPException(status_code=403, detail="You must be a member to post here.")

    post = Post(
        author_id=current_user.id,
        content=body.content,
        post_type="club",
        club_id=club.id,
        image_urls=body.image_urls,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    return PostResponse(
        id=post.id,
        content=post.content,
        post_type="club",
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
        is_pinned=False,
        parent_post_id=None,
    )


@router.get("/{slug}/requests")
async def get_join_requests(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)
    membership = await _get_membership(club.id, current_user.id, db)
    if not membership or membership.role not in ("owner", "moderator"):
        raise HTTPException(status_code=403, detail="Only the owner or a moderator can view join requests.")

    rows = (
        await db.execute(
            select(User.username, User.display_name, ClubJoinRequest.created_at)
            .join(ClubJoinRequest, ClubJoinRequest.user_id == User.id)
            .where(ClubJoinRequest.club_id == club.id)
            .order_by(ClubJoinRequest.created_at.asc())
        )
    ).all()
    return [
        {"username": r.username, "display_name": r.display_name, "requested_at": r.created_at}
        for r in rows
    ]


@router.post("/{slug}/requests/{username}/approve", status_code=status.HTTP_204_NO_CONTENT)
async def approve_join_request(
    slug: str,
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)
    membership = await _get_membership(club.id, current_user.id, db)
    if not membership or membership.role not in ("owner", "moderator"):
        raise HTTPException(status_code=403, detail="Only the owner or a moderator can approve requests.")

    target = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    request = await _get_join_request(club.id, target.id, db)
    if not request:
        raise HTTPException(status_code=404, detail="No pending request from this user.")

    await db.delete(request)
    db.add(ClubMember(club_id=club.id, user_id=target.id, role="member"))
    await db.commit()


@router.delete("/{slug}/requests/{username}", status_code=status.HTTP_204_NO_CONTENT)
async def reject_or_cancel_join_request(
    slug: str,
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Owner/moderator can reject; the requester themselves can cancel."""
    club = await _get_club_or_404(slug, db)
    membership = await _get_membership(club.id, current_user.id, db)

    target = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    is_moderator = membership and membership.role in ("owner", "moderator")
    is_self = target.id == current_user.id
    if not is_moderator and not is_self:
        raise HTTPException(status_code=403, detail="Not authorised.")

    request = await _get_join_request(club.id, target.id, db)
    if not request:
        raise HTTPException(status_code=404, detail="No pending request from this user.")

    await db.delete(request)
    await db.commit()


@router.get("/{slug}/members")
async def get_club_members(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)
    rows = (
        await db.execute(
            select(User.username, User.display_name, ClubMember.role, ClubMember.joined_at)
            .join(ClubMember, ClubMember.user_id == User.id)
            .where(ClubMember.club_id == club.id)
            .order_by(ClubMember.joined_at.asc())
        )
    ).all()
    return [
        {"username": r.username, "display_name": r.display_name, "role": r.role, "joined_at": r.joined_at}
        for r in rows
    ]


@router.delete("/{slug}/members/{username}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    slug: str,
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)

    requester = await _get_membership(club.id, current_user.id, db)
    if not requester or requester.role not in ("owner", "moderator"):
        raise HTTPException(status_code=403, detail="Only the owner or a moderator can remove members.")

    target = (
        await db.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    target_membership = await _get_membership(club.id, target.id, db)
    if not target_membership:
        raise HTTPException(status_code=404, detail="That user is not a member of this club.")
    if target_membership.role == "owner":
        raise HTTPException(status_code=400, detail="The owner cannot be removed.")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Use the leave endpoint to leave the club yourself.")

    await db.delete(target_membership)
    await db.commit()


@router.post("/{slug}/invite/{username}", status_code=status.HTTP_204_NO_CONTENT)
async def invite_member(
    slug: str,
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)
    requester = await _get_membership(club.id, current_user.id, db)
    if not requester or requester.role not in ("owner", "moderator"):
        raise HTTPException(status_code=403, detail="Only the owner or a moderator can invite members.")

    target = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot invite yourself.")

    if await _get_membership(club.id, target.id, db):
        raise HTTPException(status_code=409, detail="That user is already a member.")

    existing_invite = (await db.execute(
        select(ClubInvitation).where(
            ClubInvitation.club_id == club.id,
            ClubInvitation.invited_user_id == target.id,
        )
    )).scalar_one_or_none()
    if existing_invite:
        raise HTTPException(status_code=409, detail="That user already has a pending invitation.")

    db.add(ClubInvitation(club_id=club.id, invited_by=current_user.id, invited_user_id=target.id))
    await db.commit()


@router.post("/{slug}/invitations/accept", status_code=status.HTTP_204_NO_CONTENT)
async def accept_invitation(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)

    invite = (await db.execute(
        select(ClubInvitation).where(
            ClubInvitation.club_id == club.id,
            ClubInvitation.invited_user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="No invitation found.")

    await db.delete(invite)
    db.add(ClubMember(club_id=club.id, user_id=current_user.id, role="member"))
    await db.commit()


@router.delete("/{slug}/invitations/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_invitation(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)

    invite = (await db.execute(
        select(ClubInvitation).where(
            ClubInvitation.club_id == club.id,
            ClubInvitation.invited_user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="No invitation found.")

    await db.delete(invite)
    await db.commit()


class UpdateMemberRoleRequest(BaseModel):
    role: str  # "member" | "moderator" | "owner"


@router.put("/{slug}/members/{username}/role", status_code=status.HTTP_204_NO_CONTENT)
async def update_member_role(
    slug: str,
    username: str,
    body: UpdateMemberRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.role not in ("member", "moderator", "owner"):
        raise HTTPException(status_code=422, detail="role must be 'member', 'moderator', or 'owner'.")

    club = await _get_club_or_404(slug, db)
    requester = await _get_membership(club.id, current_user.id, db)
    if not requester or requester.role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can change member roles.")

    target = (
        await db.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role.")

    target_membership = await _get_membership(club.id, target.id, db)
    if not target_membership:
        raise HTTPException(status_code=404, detail="That user is not a member of this club.")

    target_membership.role = body.role
    await db.commit()


@router.post("/{slug}/posts/{post_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def pin_club_post(
    slug: str,
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)
    membership = await _get_membership(club.id, current_user.id, db)
    if not membership or membership.role not in ("owner", "moderator"):
        raise HTTPException(status_code=403, detail="Only the owner or a moderator can pin posts.")

    post = await db.get(Post, post_id)
    if not post or post.club_id != club.id or post.is_deleted:
        raise HTTPException(status_code=404, detail="Post not found.")

    if not post.is_pinned:
        pin_count = (
            await db.execute(
                select(func.count(Post.id)).where(
                    Post.club_id == club.id,
                    Post.is_pinned == True,
                    Post.is_deleted == False,
                )
            )
        ).scalar() or 0
        if pin_count >= 3:
            raise HTTPException(status_code=400, detail="A club can have at most 3 pinned posts.")
        post.is_pinned = True
        await db.commit()


@router.delete("/{slug}/posts/{post_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def unpin_club_post(
    slug: str,
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)
    membership = await _get_membership(club.id, current_user.id, db)
    if not membership or membership.role not in ("owner", "moderator"):
        raise HTTPException(status_code=403, detail="Only the owner or a moderator can unpin posts.")

    post = await db.get(Post, post_id)
    if not post or post.club_id != club.id:
        raise HTTPException(status_code=404, detail="Post not found.")

    post.is_pinned = False
    await db.commit()


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_club(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = await _get_club_or_404(slug, db)
    membership = await _get_membership(club.id, current_user.id, db)
    if not membership or membership.role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can delete this club.")
    await db.delete(club)
    await db.commit()


@router.post("/{slug}/posts/{post_id}/vote", response_model=VoteResponse)
async def vote_club_post(
    slug: str,
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
