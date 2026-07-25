"""Club event tests.

An event is a club post carrying a start time, so the things worth pinning
down are the ones that aren't obvious from the post machinery it reuses:

1. RSVP counts can't double-count a person, and re-sending your current
   answer withdraws it.
2. Half-events are rejected at the edge (a location or end with no start),
   so nothing renders as an event with no date.
3. Events are club-only — the feed endpoint ignores the fields rather than
   quietly creating an event nobody can RSVP to.
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models.club import Club
from app.models.club_member import ClubMember
from app.models.notification import Notification


async def _club_with_members(db, owner, *members):
    club = Club(
        name=f"Test Club {owner.username}",
        slug=f"test-club-{owner.username}",
        description="fixture club",
        created_by=owner.id,
        is_private=False,
    )
    db.add(club)
    await db.flush()
    for user, role in [(owner, "owner")] + [(m, "member") for m in members]:
        db.add(ClubMember(club_id=club.id, user_id=user.id, role=role))
    await db.commit()
    return club


def _future(hours: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


async def test_event_post_carries_details_and_rsvp_counts(client_for, make_user, db):
    owner, member = await make_user(), await make_user()
    club = await _club_with_members(db, owner, member)
    owner_c, member_c = client_for(owner), client_for(member)

    r = await owner_c.post(f"/api/clubs/{club.slug}/posts", json={
        "content": "Study session",
        "event_starts_at": _future(24),
        "event_ends_at": _future(26),
        "event_location": "Room B204",
    })
    assert r.status_code == 201
    post = r.json()
    assert post["event"]["location"] == "Room B204"
    assert post["event"]["going_count"] == 0
    assert post["event"]["is_past"] is False
    post_id = post["id"]

    ev = (await owner_c.post(f"/api/posts/{post_id}/rsvp", json={"status": "going"})).json()
    assert (ev["going_count"], ev["user_status"]) == (1, "going")

    # Same person answering twice must not inflate the headcount.
    ev = (await owner_c.post(f"/api/posts/{post_id}/rsvp", json={"status": "going"})).json()
    assert (ev["going_count"], ev["user_status"]) == (0, None)

    await owner_c.post(f"/api/posts/{post_id}/rsvp", json={"status": "going"})
    ev = (await member_c.post(f"/api/posts/{post_id}/rsvp", json={"status": "going"})).json()
    assert ev["going_count"] == 2

    # Switching sides moves the person rather than counting them twice.
    ev = (await member_c.post(f"/api/posts/{post_id}/rsvp", json={"status": "interested"})).json()
    assert (ev["going_count"], ev["interested_count"]) == (1, 1)


async def test_each_viewer_sees_their_own_rsvp_status(client_for, make_user, db):
    owner, member = await make_user(), await make_user()
    club = await _club_with_members(db, owner, member)
    owner_c, member_c = client_for(owner), client_for(member)

    post_id = (await owner_c.post(f"/api/clubs/{club.slug}/posts", json={
        "content": "Movie night", "event_starts_at": _future(48),
    })).json()["id"]
    await owner_c.post(f"/api/posts/{post_id}/rsvp", json={"status": "going"})

    def find(feed):
        return next(p for p in feed["posts"] if p["id"] == post_id)["event"]

    assert find((await owner_c.get(f"/api/clubs/{club.slug}/posts")).json())["user_status"] == "going"
    assert find((await member_c.get(f"/api/clubs/{club.slug}/posts")).json())["user_status"] is None


async def test_half_events_are_rejected(client_for, make_user, db):
    owner = await make_user()
    club = await _club_with_members(db, owner)
    owner_c = client_for(owner)

    # A location or an end with no start would render as a dateless event.
    for payload in (
        {"content": "x", "event_location": "Nowhere"},
        {"content": "x", "event_ends_at": _future(3)},
        {"content": "x", "event_starts_at": _future(5), "event_ends_at": _future(4)},
    ):
        r = await owner_c.post(f"/api/clubs/{club.slug}/posts", json=payload)
        assert r.status_code == 422, payload


async def test_rsvp_rejected_on_non_events(client_for, make_user, db):
    owner = await make_user()
    club = await _club_with_members(db, owner)
    owner_c = client_for(owner)

    plain_id = (await owner_c.post(f"/api/clubs/{club.slug}/posts", json={"content": "just a post"})).json()["id"]
    r = await owner_c.post(f"/api/posts/{plain_id}/rsvp", json={"status": "going"})
    assert r.status_code == 400


async def test_events_are_club_only(client_for, make_user):
    """The feed endpoint ignores event fields rather than creating an event
    that has no club context to RSVP within."""
    user = await make_user()
    c = client_for(user)

    post = (await c.post("/api/posts", json={
        "content": "feed post", "event_starts_at": _future(12),
    })).json()
    assert post["event"] is None


async def test_creating_an_event_notifies_the_other_members(client_for, make_user, db):
    """Members need to hear about an event in time to show up — the one club
    activity that earns a notification. The creator is never notified, and a
    plain club post still notifies nobody."""
    owner, member, other = await make_user(), await make_user(), await make_user()
    club = await _club_with_members(db, owner, member, other)
    owner_c = client_for(owner)

    await owner_c.post(f"/api/clubs/{club.slug}/posts", json={"content": "just a post"})
    await asyncio.sleep(0.2)  # fan-out runs detached from the request
    # Scoped to this test's members — the suite shares one database, so a
    # global count would pick up events other tests created.
    assert (await db.execute(
        select(Notification).where(
            Notification.type == "club_event",
            Notification.user_id.in_([member.id, other.id]),
        )
    )).scalars().all() == []

    r = await owner_c.post(f"/api/clubs/{club.slug}/posts", json={
        "content": "Movie night", "event_starts_at": _future(24),
    })
    post_id = uuid.UUID(r.json()["id"])
    await asyncio.sleep(0.2)

    rows = (await db.execute(
        select(Notification).where(
            Notification.type == "club_event", Notification.reference_id == post_id
        )
    )).scalars().all()
    assert {n.user_id for n in rows} == {member.id, other.id}
    assert all(n.actor_id == owner.id for n in rows)


async def test_blocked_member_is_not_notified_of_an_event(client_for, make_user, db):
    owner, member = await make_user(), await make_user()
    club = await _club_with_members(db, owner, member)
    owner_c = client_for(owner)

    assert (await owner_c.post(f"/api/users/{member.username}/block")).status_code == 204

    r = await owner_c.post(f"/api/clubs/{club.slug}/posts", json={
        "content": "Movie night", "event_starts_at": _future(24),
    })
    post_id = uuid.UUID(r.json()["id"])
    await asyncio.sleep(0.2)

    rows = (await db.execute(
        select(Notification).where(
            Notification.type == "club_event", Notification.reference_id == post_id
        )
    )).scalars().all()
    assert rows == []


async def test_rsvp_list_shows_who_is_going_and_interested(client_for, make_user, db):
    """Members can see the attendee lists — the whole point of an RSVP is that
    it's a public commitment to show up."""
    owner, a, b = await make_user(), await make_user(), await make_user()
    club = await _club_with_members(db, owner, a, b)
    owner_c, a_c, b_c = client_for(owner), client_for(a), client_for(b)

    post_id = (await owner_c.post(f"/api/clubs/{club.slug}/posts", json={
        "content": "Hackathon", "event_starts_at": _future(24),
    })).json()["id"]

    await a_c.post(f"/api/posts/{post_id}/rsvp", json={"status": "going"})
    await b_c.post(f"/api/posts/{post_id}/rsvp", json={"status": "interested"})

    lists = (await owner_c.get(f"/api/posts/{post_id}/rsvps")).json()
    assert {p["username"] for p in lists["going"]} == {a.username}
    assert {p["username"] for p in lists["interested"]} == {b.username}


async def test_rsvp_list_rejected_on_non_events(client_for, make_user, db):
    owner = await make_user()
    club = await _club_with_members(db, owner)
    owner_c = client_for(owner)
    plain_id = (await owner_c.post(f"/api/clubs/{club.slug}/posts", json={"content": "hi"})).json()["id"]
    assert (await owner_c.get(f"/api/posts/{plain_id}/rsvps")).status_code == 400


async def test_private_club_event_hidden_from_non_members(client_for, make_user, db):
    owner, outsider = await make_user(), await make_user()
    club = await _club_with_members(db, owner)
    club.is_private = True
    await db.commit()

    owner_c, outsider_c = client_for(owner), client_for(outsider)
    post_id = (await owner_c.post(f"/api/clubs/{club.slug}/posts", json={
        "content": "members only", "event_starts_at": _future(24),
    })).json()["id"]

    # Same 404 the read path gives — RSVP must not become a private-club oracle.
    assert (await outsider_c.post(f"/api/posts/{post_id}/rsvp", json={"status": "going"})).status_code == 404
