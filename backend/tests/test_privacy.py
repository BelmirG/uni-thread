"""Privacy invariant tests."""
import uuid

from sqlalchemy import select

from app.models.anonymous_post_author import AnonymousPostAuthor
from app.models.notification import Notification
from app.models.post import Post


async def test_anonymous_question_never_exposes_author(client_for, make_user, db):
    alice = await make_user()
    bob = await make_user()
    alice_c, bob_c = client_for(alice), client_for(bob)

    r = await alice_c.post("/api/qa", json={"content": "Is the exam schedule out yet?"})
    assert r.status_code == 201
    q = r.json()
    assert alice.username not in r.text
    assert str(alice.id) not in r.text

    post = (await db.execute(select(Post).where(Post.id == uuid.UUID(q["id"])))).scalar_one()
    assert post.author_id is None
    assert post.is_anonymous is True

    link = (await db.execute(
        select(AnonymousPostAuthor).where(AnonymousPostAuthor.post_id == post.id)
    )).scalar_one()
    assert link.user_id == alice.id

    for url in ("/api/qa", f"/api/qa/{q['id']}"):
        r = await bob_c.get(url)
        assert r.status_code == 200
        assert alice.username not in r.text
        assert str(alice.id) not in r.text


async def test_is_own_flag_only_marks_the_real_author(client_for, make_user):
    alice = await make_user()
    bob = await make_user()
    alice_c, bob_c = client_for(alice), client_for(bob)

    q = (await alice_c.post("/api/qa", json={"content": "own-flag test"})).json()

    r = await alice_c.get(f"/api/qa/{q['id']}")
    assert r.json()["question"]["is_own"] is True

    r = await bob_c.get(f"/api/qa/{q['id']}")
    assert r.json()["question"]["is_own"] is False


async def test_answer_notification_is_actorless(client_for, make_user, db):
    alice = await make_user()
    bob = await make_user()
    alice_c, bob_c = client_for(alice), client_for(bob)

    q = (await alice_c.post("/api/qa", json={"content": "notif test question"})).json()
    r = await bob_c.post(f"/api/qa/{q['id']}/answers", json={"content": "an answer"})
    assert r.status_code == 201
    assert bob.username not in r.text and alice.username not in r.text

    notif = (await db.execute(select(Notification).where(
        Notification.user_id == alice.id, Notification.type == "qa_answer"
    ))).scalar_one()
    assert notif.actor_id is None

    r = await alice_c.get("/api/notifications")
    assert r.status_code == 200
    assert bob.username not in r.text
    assert str(bob.id) not in r.text
    entry = next(n for n in r.json()["notifications"] if n["type"] == "qa_answer")
    assert entry["actor_username"] is None
    assert entry["actor_display_name"] is None


async def test_self_answer_creates_no_notification(client_for, make_user, db):
    alice = await make_user()
    alice_c = client_for(alice)

    q = (await alice_c.post("/api/qa", json={"content": "talking to myself"})).json()
    r = await alice_c.post(f"/api/qa/{q['id']}/answers", json={"content": "me again"})
    assert r.status_code == 201

    count = len((await db.execute(select(Notification).where(
        Notification.user_id == alice.id, Notification.type == "qa_answer"
    ))).all())
    assert count == 0


async def test_only_real_author_or_admin_can_delete_anonymous_post(client_for, make_user):
    alice = await make_user()
    bob = await make_user()
    admin = await make_user(is_admin=True)
    alice_c, bob_c, admin_c = client_for(alice), client_for(bob), client_for(admin)

    q1 = (await alice_c.post("/api/qa", json={"content": "delete test 1"})).json()
    q2 = (await alice_c.post("/api/qa", json={"content": "delete test 2"})).json()

    assert (await bob_c.delete(f"/api/qa/{q1['id']}")).status_code == 403
    assert (await alice_c.delete(f"/api/qa/{q1['id']}")).status_code == 204
    # Admins can moderate.
    assert (await admin_c.delete(f"/api/qa/{q2['id']}")).status_code == 204


async def test_private_club_content_hidden_from_non_members(client_for, make_user):
    owner = await make_user()
    outsider = await make_user()
    owner_c, out_c = client_for(owner), client_for(outsider)

    r = await owner_c.post("/api/clubs", json={
        "name": f"Secret Society {uuid.uuid4().hex[:6]}",
        "description": "members only",
        "is_private": True,
    })
    assert r.status_code == 201
    slug = r.json()["slug"]

    r = await owner_c.post(f"/api/clubs/{slug}/posts", json={"content": "internal announcement"})
    assert r.status_code == 201
    post_id = r.json()["id"]

    # The main feed never lists the private club's post.
    r = await out_c.get("/api/posts")
    assert r.status_code == 200
    assert post_id not in r.text

    assert (await out_c.get(f"/api/posts/{post_id}")).status_code == 404
    assert (await out_c.post(f"/api/posts/{post_id}/replies", json={"content": "hi"})).status_code == 404
    assert (await out_c.post(f"/api/posts/{post_id}/vote", json={"vote_type": "up"})).status_code == 404

    # Club surfaces refuse non-members outright.
    assert (await out_c.get(f"/api/clubs/{slug}/posts")).status_code == 403
    assert (await out_c.get(f"/api/clubs/{slug}/chat")).status_code == 403

    assert (await owner_c.get(f"/api/posts/{post_id}")).status_code == 200


async def test_deactivated_user_cannot_act(client_for, make_user):
    ghost = await make_user(is_active=False)
    ghost_c = client_for(ghost)

    assert (await ghost_c.get("/api/posts")).status_code == 401
    assert (await ghost_c.post("/api/posts", json={"content": "hi"})).status_code == 401
    assert (await ghost_c.post("/api/qa", json={"content": "hi"})).status_code == 401
    assert (await ghost_c.get("/api/notifications")).status_code == 401


async def test_registration_rejects_foreign_email_domains(client_for):
    anon_c = client_for()
    for email in ("someone@gmail.com", "staff@ius.edu.ba", "x@student.other.edu"):
        r = await anon_c.post("/api/auth/register", json={
            "email": email,
            "username": f"reject_{uuid.uuid4().hex[:8]}",
            "display_name": "Should Not Exist",
            "password": "password123",
        })
        assert r.status_code == 422, f"{email} was not rejected"
