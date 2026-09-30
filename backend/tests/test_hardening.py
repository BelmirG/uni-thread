"""Security hardening: client IP, rate limits, session revocation, deletion."""
import random
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from starlette.requests import Request

from app.core.rate_limit import client_ip
from app.core.security import create_access_token
from app.core.sessions import user_from_token
from app.main import app
from app.models.admin_action import AdminAction
from app.models.chat_message import ChatMessage
from app.models.club import Club
from app.models.club_member import ClubMember
from app.models.post import Post
from app.models.user import User


def _req(headers: dict[str, str], peer: str = "10.0.0.1") -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "headers": raw, "client": (peer, 1234)})


def _public_ip() -> str:
    # Random per run so Redis counters from a previous run (same window) can't
    # leak into this one.
    return f"8.8.{random.randint(0, 255)}.{random.randint(1, 254)}"


def _client_behind_edge(real_ip: str, forged: str | None = None) -> httpx.AsyncClient:
    """What the backend sees in production: Railway's edge sets X-Real-IP to the
    real client; X-Forwarded-For / CF-Connecting-IP may hold anything."""
    headers = {"X-Real-IP": real_ip}
    if forged:
        headers |= {"X-Forwarded-For": forged, "CF-Connecting-IP": forged}
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=("10.1.2.3", 1)),
        base_url="http://test",
        headers=headers,
    )


# ── client IP ─────────────────────────────────────────────────────────────────

def test_client_ip_uses_the_edge_set_header():
    assert client_ip(_req({"X-Real-IP": "8.8.8.8", "X-Forwarded-For": "1.2.3.4"})) == "8.8.8.8"


def test_client_ip_never_trusts_forgeable_headers():
    forged = {"X-Forwarded-For": "1.2.3.4", "CF-Connecting-IP": "5.6.7.8"}
    assert client_ip(_req(forged, peer="10.9.9.9")) == "10.9.9.9"


def test_client_ip_handles_ipv6_and_garbage():
    assert client_ip(_req({"X-Real-IP": "2606:4700::1111"})) == "2606:4700::1111"
    assert client_ip(_req({"X-Real-IP": "not-an-ip"}, peer="10.9.9.9")) == "10.9.9.9"


def test_client_ip_falls_back_to_peer_without_header():
    assert client_ip(_req({}, peer="10.9.9.9")) == "10.9.9.9"


# ── rate limits ───────────────────────────────────────────────────────────────

async def test_rotating_spoofed_ips_no_longer_bypass_login_limit():
    """Forged X-Forwarded-For entries must not create fresh rate-limit buckets."""
    real = _public_ip()
    codes = []
    for i in range(31):
        async with _client_behind_edge(real, forged=f"1.1.{i}.1") as c:
            r = await c.post("/api/auth/login", json={
                "email": f"nobody{i}_{uuid.uuid4().hex[:6]}@student.ius.edu.ba",
                "password": "wrong-password",
            })
            codes.append(r.status_code)
    assert codes[:30] == [401] * 30
    assert codes[30] == 429


async def test_one_account_is_protected_from_many_ips():
    email = f"target_{uuid.uuid4().hex[:8]}@student.ius.edu.ba"
    codes = []
    for _ in range(11):
        async with _client_behind_edge(_public_ip()) as c:
            r = await c.post("/api/auth/login", json={"email": email, "password": "guess-guess"})
            codes.append(r.status_code)
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


async def test_posting_is_limited_per_account(client_for, make_user):
    c = client_for(await make_user())
    for i in range(30):
        assert (await c.post("/api/posts", json={"content": f"post {i}"})).status_code == 201
    assert (await c.post("/api/posts", json={"content": "one too many"})).status_code == 429


async def test_a_busy_user_does_not_throttle_others(client_for, make_user):
    busy = client_for(await make_user())
    for i in range(31):
        await busy.post("/api/posts", json={"content": f"spam {i}"})
    other = client_for(await make_user())
    assert (await other.post("/api/posts", json={"content": "hello"})).status_code == 201


# ── registration squatting ────────────────────────────────────────────────────

async def _unverified(db, *, expired: bool) -> User:
    name = f"u_{uuid.uuid4().hex[:10]}"
    user = User(
        email=f"{name}@student.ius.edu.ba", username=name, display_name=name,
        password_hash="x", is_email_verified=False,
        email_verification_token=uuid.uuid4().hex,
        email_verification_expires_at=datetime.now(timezone.utc) + timedelta(hours=-1 if expired else 23),
    )
    db.add(user)
    await db.commit()
    return user


async def test_expired_unverified_signup_can_be_replaced(client_for, db):
    stale = await _unverified(db, expired=True)
    email, username = stale.email, stale.username
    r = await client_for(None).post("/api/auth/register", json={
        "email": email, "username": username,
        "display_name": "Real Owner", "password": "a-strong-pass",
    })
    assert r.status_code == 201
    db.expire_all()
    rows = (await db.execute(select(User).where(User.email == email))).scalars().all()
    assert len(rows) == 1 and rows[0].display_name == "Real Owner"


async def test_pending_signup_cannot_be_hijacked(client_for, db):
    pending = await _unverified(db, expired=False)
    r = await client_for(None).post("/api/auth/register", json={
        "email": pending.email, "username": f"x_{uuid.uuid4().hex[:8]}",
        "display_name": "Intruder", "password": "attacker-pass",
    })
    assert r.status_code == 409


# ── sessions ──────────────────────────────────────────────────────────────────

def _client_with_token(token: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=("10.2.2.2", 1)),
        base_url="http://test", cookies={"access_token": token},
    )


async def test_logout_kills_the_token_everywhere(make_user):
    user = await make_user()
    token = create_access_token(str(user.id))
    async with _client_with_token(token) as c:
        assert (await c.get("/api/auth/me")).status_code == 200
        assert (await c.post("/api/auth/logout")).status_code == 200
    # Someone holding a copy of the same token:
    async with _client_with_token(token) as copy:
        assert (await copy.get("/api/auth/me")).status_code == 401


async def test_password_reset_ends_existing_sessions(make_user, db):
    user = await make_user()
    old_token = create_access_token(str(user.id))
    user.password_reset_token = "reset-" + uuid.uuid4().hex
    user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.commit()

    async with _client_with_token(old_token) as c:
        assert (await c.get("/api/auth/me")).status_code == 200
        r = await c.post("/api/auth/reset-password", json={
            "token": user.password_reset_token, "new_password": "brand-new-pass",
        })
        assert r.status_code == 200
        assert (await c.get("/api/auth/me")).status_code == 401


async def test_session_check_rejects_banned_users(make_user, db):
    user = await make_user()
    token = create_access_token(str(user.id))
    assert await user_from_token(db, token) is not None
    user.is_active = False
    await db.commit()
    assert await user_from_token(db, token) is None


# ── account deletion ──────────────────────────────────────────────────────────

async def test_deleting_an_account_hides_all_their_posts(client_for, make_user, db):
    user = await make_user()
    c = client_for(user)
    feed_id = (await c.post("/api/posts", json={"content": "visible post"})).json()["id"]
    anon_id = (await c.post("/api/qa", json={"content": "anonymous question"})).json()["id"]

    r = await c.request("DELETE", "/api/users/me", json={"password": "testpass123"})
    assert r.status_code == 200

    db.expire_all()
    for pid in (feed_id, anon_id):
        post = (await db.execute(select(Post).where(Post.id == uuid.UUID(pid)))).scalar_one()
        assert post.is_deleted, "a deleted account's post must not stay in the feed"


async def test_admin_account_delete_also_hides_posts(client_for, make_user, db):
    admin = await make_user(is_admin=True)
    target = await make_user()
    pid = (await client_for(target).post("/api/posts", json={"content": "spam"})).json()["id"]
    assert (await client_for(admin).delete(f"/api/admin/users/{target.username}")).status_code == 200
    db.expire_all()
    post = (await db.execute(select(Post).where(Post.id == uuid.UUID(pid)))).scalar_one()
    assert post.is_deleted


# ── club chat deletion ────────────────────────────────────────────────────────

async def _club_with_message(db, owner, *members):
    club = Club(name=f"Chat {uuid.uuid4().hex[:6]}", slug=f"chat-{uuid.uuid4().hex[:8]}",
                description="x", created_by=owner.id)
    db.add(club)
    await db.flush()
    db.add(ClubMember(club_id=club.id, user_id=owner.id, role="owner"))
    for m in members:
        db.add(ClubMember(club_id=club.id, user_id=m.id, role="member"))
    msg = ChatMessage(club_id=club.id, author_id=members[0].id, content="delete me")
    db.add(msg)
    await db.commit()
    return club, msg


async def test_chat_delete_permissions(client_for, make_user, db):
    owner, author, bystander = await make_user(), await make_user(), await make_user()
    club, msg = await _club_with_message(db, owner, author, bystander)
    slug, msg_id = club.slug, msg.id
    url = f"/api/clubs/{slug}/chat/{msg_id}"
    author_c = client_for(author)

    assert (await client_for(bystander).delete(url)).status_code == 403
    assert (await client_for(owner).delete(url)).status_code == 204
    db.expire_all()
    assert (await db.execute(select(ChatMessage.is_deleted).where(ChatMessage.id == msg_id))).scalar_one()
    history = (await author_c.get(f"/api/clubs/{slug}/chat")).json()
    assert all(m["id"] != str(msg_id) for m in history)


async def test_author_can_delete_own_chat_message(client_for, make_user, db):
    owner, author = await make_user(), await make_user()
    club, msg = await _club_with_message(db, owner, author)
    assert (await client_for(author).delete(f"/api/clubs/{club.slug}/chat/{msg.id}")).status_code == 204


async def test_app_admin_can_delete_chat_and_it_is_logged(client_for, make_user, db):
    owner, author = await make_user(), await make_user()
    admin = await make_user(is_admin=True)
    club, msg = await _club_with_message(db, owner, author)
    assert (await client_for(admin).delete(f"/api/clubs/{club.slug}/chat/{msg.id}")).status_code == 204
    logged = (await db.execute(select(AdminAction).where(
        AdminAction.action == "delete_chat_message", AdminAction.actor_username == admin.username,
    ))).scalar_one_or_none()
    assert logged is not None
