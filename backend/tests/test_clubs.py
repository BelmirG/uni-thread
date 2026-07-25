"""Club membership state-machine tests.

A club has two independent ways in — user-initiated join requests and
owner-initiated invitations — and every membership transition (join, approve,
accept, leave, kick) must leave those two systems agreeing with reality. The
bug these pin down: a kicked member's stale join request survived, so
`has_pending_request` stayed true forever — hiding their Join button (they
couldn't re-request) while they lingered in the owner's requests list, and the
owner's invite path was blocked too. Nobody could get them back in.
"""
from sqlalchemy import select

from app.models.club import Club
from app.models.club_invitation import ClubInvitation
from app.models.club_join_request import ClubJoinRequest
from app.models.club_member import ClubMember


async def _private_club(db, owner):
    club = Club(
        name=f"Private {owner.username}",
        slug=f"private-{owner.username}",
        description="fixture",
        created_by=owner.id,
        is_private=True,
    )
    db.add(club)
    await db.flush()
    db.add(ClubMember(club_id=club.id, user_id=owner.id, role="owner"))
    await db.commit()
    return club


async def _has_request(db, club, user) -> bool:
    return (await db.execute(
        select(ClubJoinRequest).where(
            ClubJoinRequest.club_id == club.id, ClubJoinRequest.user_id == user.id
        )
    )).scalar_one_or_none() is not None


async def _is_member(db, club, user) -> bool:
    return (await db.execute(
        select(ClubMember).where(
            ClubMember.club_id == club.id, ClubMember.user_id == user.id
        )
    )).scalar_one_or_none() is not None


async def test_kicking_a_member_clears_their_stale_request(client_for, make_user, db):
    """The reported bug, end to end: request → approve → kick, then the user
    must be able to request again (no lingering 'pending')."""
    owner, friend = await make_user(), await make_user()
    club = await _private_club(db, owner)
    owner_c, friend_c = client_for(owner), client_for(friend)

    assert (await friend_c.post(f"/api/clubs/{club.slug}/join")).status_code == 200
    assert await _has_request(db, club, friend)

    assert (await owner_c.post(f"/api/clubs/{club.slug}/requests/{friend.username}/approve")).status_code == 204
    await db.commit()  # see rows the request's own session committed
    assert await _is_member(db, club, friend)
    assert not await _has_request(db, club, friend)  # approval consumed the request

    assert (await owner_c.delete(f"/api/clubs/{club.slug}/members/{friend.username}")).status_code == 204
    await db.commit()
    assert not await _is_member(db, club, friend)
    assert not await _has_request(db, club, friend)  # the fix: no orphan left behind

    # The friend is no longer stuck — they can request again.
    assert (await friend_c.post(f"/api/clubs/{club.slug}/join")).status_code == 200


async def test_approve_is_idempotent_when_already_a_member(client_for, make_user, db):
    """A double-approve (or a race) must not 500 on a duplicate-member insert
    and leave the request undeleted — the failure mode that first stuck them."""
    owner, friend = await make_user(), await make_user()
    club = await _private_club(db, owner)
    owner_c, friend_c = client_for(owner), client_for(friend)

    await friend_c.post(f"/api/clubs/{club.slug}/join")
    assert (await owner_c.post(f"/api/clubs/{club.slug}/requests/{friend.username}/approve")).status_code == 204
    # Second approve with no pending request but an existing membership.
    assert (await owner_c.post(f"/api/clubs/{club.slug}/requests/{friend.username}/approve")).status_code == 204
    await db.commit()
    assert await _is_member(db, club, friend)


async def test_leaving_clears_a_pending_invitation(client_for, make_user, db):
    """Leaving a club shouldn't leave a dangling invite that lets the user
    'accept' their way back in behind the owner's back."""
    owner, friend = await make_user(), await make_user()
    club = await _private_club(db, owner)
    owner_c, friend_c = client_for(owner), client_for(friend)

    # Owner invites, friend accepts, then leaves.
    assert (await owner_c.post(f"/api/clubs/{club.slug}/invite/{friend.username}")).status_code == 204
    assert (await friend_c.post(f"/api/clubs/{club.slug}/invitations/accept")).status_code == 204
    await db.commit()
    assert await _is_member(db, club, friend)

    assert (await friend_c.delete(f"/api/clubs/{club.slug}/leave")).status_code == 204
    await db.commit()
    invite = (await db.execute(
        select(ClubInvitation).where(
            ClubInvitation.club_id == club.id, ClubInvitation.invited_user_id == friend.id
        )
    )).scalar_one_or_none()
    assert invite is None
