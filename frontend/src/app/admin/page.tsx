"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck, Search, Trash2, Ban, CheckCircle2, RotateCcw,
  LogOut, AlertTriangle, User as UserIcon, FileText, Flag, X,
  LayoutGrid, Users2, ScrollText, ShieldPlus, Lock,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/timeAgo";

interface Me {
  username: string;
  display_name: string;
  is_admin: boolean;
}

interface AdminUser {
  username: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  faculty: string | null;
  is_email_verified: boolean;
  is_active: boolean;
  is_admin: boolean;
  is_banned: boolean;
  ban_reason: string | null;
  created_at: string;
}

interface AdminPost {
  id: string;
  content: string;
  post_type: string;
  is_deleted: boolean;
  is_anonymous: boolean;
  author: string | null;
  created_at: string;
}

interface AdminReport {
  id: string;
  type: "user" | "post";
  reporter: string;
  reported_user: string | null;
  reported_display_name: string | null;
  post_id: string | null;
  post_type: string | null;
  post_snippet: string | null;
  post_deleted: boolean | null;
  reason: string;
  status: string;
  created_at: string;
}

interface AdminClub {
  id: string;
  name: string;
  slug: string;
  is_private: boolean;
  member_count: number;
  created_at: string;
}

interface AdminAction {
  id: string;
  actor_username: string;
  action: string;
  target_type: string;
  target_label: string;
  detail: string | null;
  created_at: string;
}

interface Stats {
  total_users: number;
  banned_users: number;
  admin_count: number;
  unverified_users: number;
  total_posts: number;
  total_clubs: number;
  pending_reports: number;
}

type Tab = "overview" | "users" | "reports" | "posts" | "clubs" | "admins" | "log";

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    apiFetch<Me>("/api/auth/me")
      .then(setMe)
      .catch(() => router.replace("/login?next=/admin"))
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) return <div className="min-h-screen bg-background" />;
  if (!me) return null; // redirect in flight
  if (!me.is_admin) return <AccessDenied />;
  return <AdminPanel me={me} />;
}

// ── Access denied ─────────────────────────────────────────────────────────────

function AccessDenied() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center mb-3">
        <Lock className="w-7 h-7 text-on-surface-variant" />
      </div>
      <h1 className="text-xl font-bold text-on-surface">Not an admin account</h1>
      <p className="text-sm text-on-surface-variant mt-1 max-w-xs">
        This account doesn't have admin access.
      </p>
      <Link href="/feed" className="text-sm text-primary mt-4 no-underline">← Back to app</Link>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function AdminPanel({ me }: { me: Me }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [banner, setBanner] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setBanner(msg);
    setTimeout(() => setBanner(null), 3000);
  }, []);

  async function signOut() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  const tabs: [Tab, string, React.ComponentType<{ className?: string }>][] = [
    ["overview", "Overview", LayoutGrid],
    ["users", "Users", UserIcon],
    ["reports", "Reports", Flag],
    ["posts", "Posts", FileText],
    ["clubs", "Clubs", Users2],
    ["admins", "Admins", ShieldPlus],
    ["log", "Log", ScrollText],
  ];

  return (
    <main className="max-w-xl mx-auto px-4 pt-5 pb-16">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-on-surface">Admin</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-on-surface-variant hidden sm:inline">@{me.username}</span>
          <button onClick={signOut} className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </div>

      {banner && (
        <div className="mb-3 rounded-xl bg-primary/10 text-primary text-sm px-4 py-2.5 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {banner}
        </div>
      )}

      {/* Tabs — segmented control, scrollable on small screens */}
      <div className="flex gap-1 p-1 bg-surface-container rounded-full mb-4 overflow-x-auto no-scrollbar">
        {tabs.map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "flex-shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-full transition-all",
              tab === k ? "bg-surface text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab flash={flash} />}
      {tab === "reports" && <ReportsTab flash={flash} />}
      {tab === "posts" && <PostsTab flash={flash} />}
      {tab === "clubs" && <ClubsTab flash={flash} />}
      {tab === "admins" && <AdminsTab me={me} />}
      {tab === "log" && <LogTab />}
    </main>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    apiFetch<Stats>("/api/admin/stats").then(setStats).catch(() => {});
  }, []);

  if (!stats) return <Loading />;

  const tiles: [string, number][] = [
    ["Total users", stats.total_users],
    ["Banned", stats.banned_users],
    ["Unverified", stats.unverified_users],
    ["Admins", stats.admin_count],
    ["Live posts", stats.total_posts],
    ["Clubs", stats.total_clubs],
    ["Pending reports", stats.pending_reports],
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map(([label, value]) => (
        <div key={label} className="bg-surface rounded-2xl shadow-sm p-4">
          <div className="text-2xl font-bold text-on-surface">{value}</div>
          <div className="text-xs text-on-surface-variant mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

const USER_FILTERS = [["all", "All"], ["unverified", "Unverified"], ["banned", "Banned"], ["admins", "Admins"]] as const;

function UsersTab({ flash }: { flash: (m: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<AdminUser[]>(`/api/admin/users?q=${encodeURIComponent(q)}&filter=${filter}`)
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, filter]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function act(u: AdminUser, action: "verify" | "ban" | "unban" | "delete") {
    try {
      if (action === "verify") {
        await apiFetch(`/api/admin/users/${u.username}/verify`, { method: "POST" });
        flash(`Verified @${u.username}`);
      } else if (action === "ban") {
        const reason = window.prompt(`Ban @${u.username} — reason?`);
        if (reason === null) return;
        await apiFetch(`/api/admin/users/${u.username}/ban`, { method: "POST", body: JSON.stringify({ reason }) });
        flash(`Banned @${u.username}`);
      } else if (action === "unban") {
        await apiFetch(`/api/admin/users/${u.username}/unban`, { method: "POST" });
        flash(`Unbanned @${u.username}`);
      } else if (action === "delete") {
        if (!window.confirm(`Permanently delete @${u.username}? This cannot be undone.`)) return;
        await apiFetch(`/api/admin/users/${u.username}`, { method: "DELETE" });
        flash(`Deleted @${u.username}`);
      }
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed.");
    }
  }

  return (
    <div>
      <SearchBar value={q} onChange={setQ} placeholder="Search by name, username, or email…" />
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3 pb-1">
        {USER_FILTERS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              "text-xs font-medium px-3.5 py-1.5 rounded-full whitespace-nowrap transition-colors",
              filter === k ? "bg-primary text-primary-foreground" : "bg-surface shadow-sm text-on-surface-variant hover:bg-surface-container"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : users.length === 0 ? <Empty label="No users found." /> : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.username} className="bg-surface rounded-2xl shadow-sm p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-on-surface truncate">{u.display_name}</span>
                    {u.is_admin && <Badge className="bg-purple-100 text-purple-700">admin</Badge>}
                    {!u.is_email_verified && <Badge className="bg-amber-100 text-amber-700">unverified</Badge>}
                    {u.is_banned && <Badge className="bg-red-100 text-red-700">banned</Badge>}
                  </div>
                  <div className="text-xs text-on-surface-variant truncate">@{u.username} · {u.email}</div>
                  {u.ban_reason && <div className="text-xs text-red-600 mt-1">Ban reason: {u.ban_reason}</div>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {!u.is_email_verified && (
                  <ActionBtn onClick={() => act(u, "verify")} icon={CheckCircle2} label="Verify" tone="primary" />
                )}
                {u.is_banned
                  ? <ActionBtn onClick={() => act(u, "unban")} icon={RotateCcw} label="Unban" tone="neutral" />
                  : !u.is_admin && <ActionBtn onClick={() => act(u, "ban")} icon={Ban} label="Ban" tone="neutral" />}
                {!u.is_admin && <ActionBtn onClick={() => act(u, "delete")} icon={Trash2} label="Delete" tone="danger" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reports tab ───────────────────────────────────────────────────────────────

function ReportsTab({ flash }: { flash: (m: string) => void }) {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<AdminReport[]>("/api/admin/reports?status=pending")
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function dismiss(id: string) {
    try {
      await apiFetch(`/api/admin/reports/${id}/dismiss`, { method: "POST" });
      flash("Report dismissed");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed.");
    }
  }

  async function banReported(username: string) {
    const reason = window.prompt(`Ban @${username} — reason?`);
    if (reason === null) return;
    try {
      await apiFetch(`/api/admin/users/${username}/ban`, { method: "POST", body: JSON.stringify({ reason }) });
      flash(`Banned @${username}`);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed.");
    }
  }

  async function deleteReportedPost(reportId: string, postId: string) {
    if (!window.confirm("Delete this post? (soft delete — recoverable via DB)")) return;
    try {
      await apiFetch(`/api/admin/posts/${postId}`, { method: "DELETE" });
      await apiFetch(`/api/admin/reports/${reportId}/dismiss`, { method: "POST" });
      flash("Post deleted, report closed");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed.");
    }
  }

  if (loading) return <Loading />;
  if (reports.length === 0) return <Empty label="No pending reports. 🎉" />;

  return (
    <div className="space-y-2">
      {reports.map((r) => (
        <div key={r.id} className="bg-surface rounded-2xl shadow-sm p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-on-surface">
                <span className="font-semibold">@{r.reporter}</span> reported{" "}
                {r.type === "post" ? (
                  <>
                    a post
                    {r.reported_user
                      ? <> by <Link href={`/profile/${r.reported_user}`} className="font-semibold text-primary no-underline">@{r.reported_user}</Link></>
                      : <span className="text-on-surface-variant"> (anonymous)</span>}
                    {r.post_deleted && <span className="text-on-surface-variant italic"> · already deleted</span>}
                  </>
                ) : (
                  <Link href={`/profile/${r.reported_user}`} className="font-semibold text-primary no-underline">@{r.reported_user}</Link>
                )}
              </div>
              {r.type === "post" && r.post_snippet && (
                <p className="text-xs text-on-surface-variant mt-1.5 px-3 py-2 bg-surface-container-low rounded-lg border-l-2 border-outline-variant whitespace-pre-wrap break-words">
                  {r.post_snippet}
                </p>
              )}
              <p className="text-sm text-on-surface-variant mt-1 whitespace-pre-wrap">{r.reason}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {r.type === "post" && r.post_id && !r.post_deleted && (
              <ActionBtn onClick={() => deleteReportedPost(r.id, r.post_id!)} icon={Trash2} label="Delete post" tone="danger" />
            )}
            {r.reported_user && (
              <ActionBtn onClick={() => banReported(r.reported_user!)} icon={Ban} label="Ban user" tone="danger" />
            )}
            <ActionBtn onClick={() => dismiss(r.id)} icon={X} label="Dismiss" tone="neutral" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Posts tab ─────────────────────────────────────────────────────────────────

function PostsTab({ flash }: { flash: (m: string) => void }) {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [q, setQ] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<AdminPost[]>(`/api/admin/posts?q=${encodeURIComponent(q)}&deleted=${showDeleted}`)
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, showDeleted]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function del(id: string) {
    if (!window.confirm("Delete this post? It will be hidden from all users.")) return;
    try {
      await apiFetch(`/api/admin/posts/${id}`, { method: "DELETE" });
      flash("Post deleted");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed.");
    }
  }

  return (
    <div>
      <SearchBar value={q} onChange={setQ} placeholder="Search post text…" />
      <div className="flex gap-2 mb-3">
        {([["Active", false], ["Deleted", true]] as const).map(([label, val]) => (
          <button
            key={label}
            onClick={() => setShowDeleted(val)}
            className={`px-4 h-9 rounded-full text-sm font-medium transition-colors ${
              showDeleted === val
                ? "bg-primary text-primary-foreground"
                : "bg-surface-container text-on-surface-variant"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? <Loading /> : posts.length === 0 ? <Empty label="No posts found." /> : (
        <div className="space-y-2">
          {posts.map((p) => (
            <div key={p.id} className="bg-surface rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <Badge className="bg-surface-container text-on-surface-variant">{p.post_type}</Badge>
                <span className="text-xs text-on-surface-variant">
                  {p.is_anonymous ? "Anonymous" : p.author ? `@${p.author}` : "no author"}
                </span>
                {p.is_deleted && <Badge className="bg-red-100 text-red-700">deleted</Badge>}
              </div>
              <p className="text-sm text-on-surface line-clamp-4 whitespace-pre-wrap">{p.content || <span className="italic text-on-surface-variant">(no text)</span>}</p>
              {!p.is_deleted && (
                <div className="flex gap-2 mt-3">
                  <ActionBtn onClick={() => del(p.id)} icon={Trash2} label="Delete" tone="danger" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Clubs tab ─────────────────────────────────────────────────────────────────

function ClubsTab({ flash }: { flash: (m: string) => void }) {
  const [clubs, setClubs] = useState<AdminClub[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<AdminClub[]>(`/api/admin/clubs?q=${encodeURIComponent(q)}`)
      .then(setClubs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function del(c: AdminClub) {
    if (!window.confirm(`Permanently delete "${c.name}"? Its posts, chat, and memberships go with it. This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/admin/clubs/${c.slug}`, { method: "DELETE" });
      flash(`Deleted "${c.name}"`);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed.");
    }
  }

  return (
    <div>
      <SearchBar value={q} onChange={setQ} placeholder="Search by club name or slug…" />
      {loading ? <Loading /> : clubs.length === 0 ? <Empty label="No clubs found." /> : (
        <div className="space-y-2">
          {clubs.map((c) => (
            <div key={c.id} className="bg-surface rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-on-surface truncate">{c.name}</span>
                    {c.is_private && <Badge className="bg-surface-container text-on-surface-variant">private</Badge>}
                  </div>
                  <div className="text-xs text-on-surface-variant truncate">/clubs/{c.slug} · {c.member_count} member{c.member_count === 1 ? "" : "s"}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <ActionBtn onClick={() => del(c)} icon={Trash2} label="Delete club" tone="danger" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Admins tab ────────────────────────────────────────────────────────────────

function AdminsTab({ me }: { me: Me }) {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<AdminUser[]>("/api/admin/users?filter=admins")
      .then(setAdmins)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="bg-surface rounded-2xl shadow-sm p-4 mb-3 flex gap-3">
        <Lock className="w-4 h-4 text-on-surface-variant flex-shrink-0 mt-0.5" />
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Admin access can't be granted or removed from this panel. Both need the server&apos;s
          master key, so no admin session — including a compromised one — can create
          new admins or lock anyone out.
        </p>
      </div>

      {loading ? <Loading /> : admins.length === 0 ? <Empty label="No admins found." /> : (
        <div className="space-y-2">
          {admins.map((u) => (
            <div key={u.username} className="bg-surface rounded-2xl shadow-sm p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-on-surface truncate">{u.display_name}</span>
                  {u.username === me.username && <Badge className="bg-surface-container text-on-surface-variant">you</Badge>}
                </div>
                <div className="text-xs text-on-surface-variant truncate">@{u.username} · {u.email}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Audit log tab ─────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  verify_user: "verified",
  ban_user: "banned",
  unban_user: "unbanned",
  delete_user: "deleted",
  promote_admin: "granted admin to",
  demote_admin: "revoked admin from",
  dismiss_report: "dismissed report on",
  delete_post: "deleted post",
  delete_club: "deleted club",
  delete_chat_message: "deleted a chat message in",
  bootstrap_admin: "granted admin (master key) to",
  revoke_admin: "revoked admin (master key) from",
};

function LogTab() {
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<AdminAction[]>("/api/admin/actions")
      .then(setActions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (actions.length === 0) return <Empty label="No admin actions yet." />;

  return (
    <div className="space-y-2">
      {actions.map((a) => (
        <div key={a.id} className="bg-surface rounded-2xl shadow-sm p-3.5">
          <p className="text-sm text-on-surface">
            <span className="font-semibold">@{a.actor_username}</span>{" "}
            {ACTION_LABELS[a.action] ?? a.action}{" "}
            <span className="font-medium">{a.target_label}</span>
          </p>
          {a.detail && (
            <p className="text-xs text-on-surface-variant mt-1 px-2.5 py-1.5 bg-surface-container-low rounded-lg whitespace-pre-wrap break-words">
              {a.detail}
            </p>
          )}
          <p className="text-[11px] text-on-surface-variant mt-1">{timeAgo(a.created_at)}</p>
        </div>
      ))}
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2.5 h-11 px-4 rounded-full bg-surface-container mb-3">
      <Search className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none"
      />
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", className)}>{children}</span>;
}

function ActionBtn({ onClick, icon: Icon, label, tone }: { onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; tone: "primary" | "neutral" | "danger" }) {
  const tones = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    neutral: "bg-surface-container text-on-surface hover:bg-surface-container-high",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
  };
  return (
    <button onClick={onClick} className={cn("flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors", tones[tone])}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function Loading() {
  return <p className="text-sm text-on-surface-variant text-center py-10">Loading…</p>;
}

function Empty({ label }: { label: string }) {
  return <p className="text-sm text-on-surface-variant text-center py-10">{label}</p>;
}
