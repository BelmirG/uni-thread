"""Admin panel access-control tests.

The admin panel used to be gated by one shared secret (ADMIN_KEY) with no
notion of who was behind it. Every mutating action is now tied to a real
account (User.is_admin) and written to admin_actions, so these tests pin
down the two things that actually matter: non-admins are locked out, and
every action leaves a trail attributing it to the acting admin.
"""
from app.config import settings
from app.models.admin_action import AdminAction
from sqlalchemy import select


async def test_non_admin_is_locked_out(client_for, make_user):
    user = await make_user()
    r = await client_for(user).get("/api/admin/users")
    assert r.status_code == 403


async def test_anonymous_is_locked_out(client_for):
    r = await client_for(None).get("/api/admin/users")
    assert r.status_code == 401


async def test_admin_can_list_users(client_for, make_user):
    admin = await make_user(is_admin=True)
    other = await make_user()
    r = await client_for(admin).get("/api/admin/users")
    assert r.status_code == 200
    assert other.username in {u["username"] for u in r.json()}


async def test_ban_is_attributed_to_the_acting_admin(client_for, make_user, db):
    admin = await make_user(is_admin=True)
    target = await make_user()
    admin_c = client_for(admin)

    r = await admin_c.post(f"/api/admin/users/{target.username}/ban", json={"reason": "spam"})
    assert r.status_code == 200

    action = (await db.execute(
        select(AdminAction).where(
            AdminAction.action == "ban_user", AdminAction.target_label == target.username
        )
    )).scalar_one_or_none()
    assert action is not None
    assert action.actor_username == admin.username
    assert action.detail == "spam"


async def test_promote_and_demote_round_trip(client_for, make_user):
    admin = await make_user(is_admin=True)
    promotee = await make_user()
    admin_c = client_for(admin)

    assert (await admin_c.post(f"/api/admin/users/{promotee.username}/promote")).status_code == 200
    # The newly promoted account can now use admin endpoints itself.
    assert (await client_for(promotee).get("/api/admin/users")).status_code == 200

    assert (await admin_c.post(f"/api/admin/users/{promotee.username}/demote")).status_code == 200
    assert (await client_for(promotee).get("/api/admin/users")).status_code == 403


async def test_admin_cannot_demote_themselves(client_for, make_user):
    admin = await make_user(is_admin=True)
    r = await client_for(admin).post(f"/api/admin/users/{admin.username}/demote")
    assert r.status_code == 400


async def test_bootstrap_requires_the_master_key(client_for, make_user):
    user = await make_user()
    c = client_for(None)

    r = await c.post(f"/api/admin/bootstrap/{user.username}", headers={"x-admin-key": "wrong"})
    assert r.status_code == 403

    r = await c.post(f"/api/admin/bootstrap/{user.username}", headers={"x-admin-key": settings.admin_key})
    assert r.status_code == 200
    assert (await client_for(user).get("/api/admin/users")).status_code == 200


async def test_deleting_a_club_cascades_and_is_logged(client_for, make_user, db):
    from app.models.club import Club
    from app.models.club_member import ClubMember

    admin = await make_user(is_admin=True)
    owner = await make_user()
    club = Club(name="Delete Me", slug="delete-me", description="x", created_by=owner.id)
    db.add(club)
    await db.flush()
    db.add(ClubMember(club_id=club.id, user_id=owner.id, role="owner"))
    await db.commit()

    r = await client_for(admin).delete(f"/api/admin/clubs/{club.slug}")
    assert r.status_code == 200

    assert (await db.execute(select(Club).where(Club.slug == club.slug))).scalar_one_or_none() is None
    action = (await db.execute(
        select(AdminAction).where(AdminAction.action == "delete_club", AdminAction.target_label == club.slug)
    )).scalar_one_or_none()
    assert action is not None
    assert action.actor_username == admin.username
