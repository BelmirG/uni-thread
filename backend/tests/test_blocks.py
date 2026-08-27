"""User blocking tests."""
from sqlalchemy import select

from app.models.block import Block
from app.models.follow import Follow
from app.models.notification import Notification


async def _block(client, username):
    r = await client.post(f"/api/users/{username}/block")
    assert r.status_code == 204
    return r


async def test_blocked_user_cannot_find_or_reach_the_blocker(client_for, make_user):
    alice, bob = await make_user(), await make_user()
    alice_c, bob_c = client_for(alice), client_for(bob)

    post_id = (await alice_c.post("/api/posts", json={"content": "alice speaks"})).json()["id"]
    assert (await bob_c.get(f"/api/users/{alice.username}")).status_code == 200

    await _block(alice_c, bob.username)

    assert (await bob_c.get(f"/api/users/search?q={alice.username}")).json() == []
    assert (await bob_c.get(f"/api/messages/search-users?q={alice.username}")).json() == []
    assert (await bob_c.get(f"/api/users/{alice.username}")).status_code == 404

    assert (await bob_c.get(f"/api/posts/{post_id}")).status_code == 404
    assert (await bob_c.post(f"/api/posts/{post_id}/replies", json={"content": "reply"})).status_code == 404
    assert (await bob_c.post(f"/api/posts/{post_id}/vote", json={"vote_type": "up"})).status_code == 404
    assert (await bob_c.post(f"/api/users/{alice.username}/follow")).status_code == 404
    assert (await bob_c.post("/api/messages/open", json={"username": alice.username})).status_code == 404

    # Content: absent from the feed entirely.
    feed = (await bob_c.get("/api/posts?limit=100")).json()["posts"]
    assert all(p["id"] != post_id for p in feed)


async def test_block_is_mutual_for_the_blocker_too(client_for, make_user):
    alice, bob = await make_user(), await make_user()
    alice_c, bob_c = client_for(alice), client_for(bob)

    bob_post = (await bob_c.post("/api/posts", json={"content": "bob speaks"})).json()["id"]
    await _block(alice_c, bob.username)

    feed = (await alice_c.get("/api/posts?limit=100")).json()["posts"]
    assert all(p["id"] != bob_post for p in feed)
    assert (await alice_c.get(f"/api/posts/{bob_post}")).status_code == 404

    profile = (await alice_c.get(f"/api/users/{bob.username}")).json()
    assert profile["is_blocked"] is True

    listed = (await alice_c.get("/api/users/me/blocked")).json()
    assert [u["username"] for u in listed] == [bob.username]


async def test_blocked_user_can_still_block_back(client_for, make_user):
    """The blocked side can't *see* the blocker, but must still be able to act."""
    alice, bob = await make_user(), await make_user()
    alice_c, bob_c = client_for(alice), client_for(bob)

    await _block(alice_c, bob.username)
    assert (await bob_c.post(f"/api/users/{alice.username}/block")).status_code == 204
    # Reporting stays open for the same reason.
    r = await bob_c.post(f"/api/users/{alice.username}/report", json={"reason": "harassment, repeated"})
    assert r.status_code == 201


async def test_block_severs_follows_and_clears_notifications(client_for, make_user, db):
    alice, bob = await make_user(), await make_user()
    alice_c, bob_c = client_for(alice), client_for(bob)

    assert (await bob_c.post(f"/api/users/{alice.username}/follow")).status_code == 204
    assert (await alice_c.post(f"/api/users/{bob.username}/follow")).status_code == 204
    assert (await db.execute(select(Notification).where(Notification.user_id == alice.id))).scalars().all()

    await _block(alice_c, bob.username)

    follows = (await db.execute(
        select(Follow).where(Follow.follower_id.in_([alice.id, bob.id]))
    )).scalars().all()
    assert follows == []

    for user_id, actor_id in ((alice.id, bob.id), (bob.id, alice.id)):
        left = (await db.execute(
            select(Notification).where(
                Notification.user_id == user_id, Notification.actor_id == actor_id
            )
        )).scalars().all()
        assert left == []


async def test_blocked_user_cannot_notify_via_mention(client_for, make_user, db):
    alice, bob = await make_user(), await make_user()
    alice_c, bob_c = client_for(alice), client_for(bob)

    await _block(alice_c, bob.username)
    await bob_c.post("/api/posts", json={"content": f"hey @{alice.username} look at this"})

    mentions = (await db.execute(
        select(Notification).where(
            Notification.user_id == alice.id, Notification.type == "mention"
        )
    )).scalars().all()
    assert mentions == []


async def test_anonymous_qa_is_never_block_filtered(client_for, make_user):
    """Blocking must not touch the anonymous board: a post vanishing the moment you."""
    alice, bob = await make_user(), await make_user()
    alice_c, bob_c = client_for(alice), client_for(bob)

    q_id = (await bob_c.post("/api/qa", json={"content": "anonymous question"})).json()["id"]
    await _block(alice_c, bob.username)

    board = (await alice_c.get("/api/qa?limit=100")).json()["posts"]
    assert any(p["id"] == q_id for p in board)
    assert (await alice_c.get(f"/api/qa/{q_id}")).status_code == 200


async def test_unblock_restores_access(client_for, make_user, db):
    alice, bob = await make_user(), await make_user()
    alice_c, bob_c = client_for(alice), client_for(bob)

    post_id = (await alice_c.post("/api/posts", json={"content": "alice speaks"})).json()["id"]
    await _block(alice_c, bob.username)
    assert (await alice_c.delete(f"/api/users/{bob.username}/block")).status_code == 204

    assert (await bob_c.get(f"/api/users/{alice.username}")).status_code == 200
    assert (await bob_c.get(f"/api/posts/{post_id}")).status_code == 200
    remaining = (await db.execute(
        select(Block).where(Block.blocker_id == alice.id, Block.blocked_id == bob.id)
    )).scalars().all()
    assert remaining == []


async def test_block_is_idempotent_and_self_block_refused(client_for, make_user, db):
    alice, bob = await make_user(), await make_user()
    alice_c = client_for(alice)

    await _block(alice_c, bob.username)
    await _block(alice_c, bob.username)  # second call must not error or duplicate

    rows = (await db.execute(select(Block).where(Block.blocker_id == alice.id))).scalars().all()
    assert len(rows) == 1
    assert (await alice_c.post(f"/api/users/{alice.username}/block")).status_code == 400
