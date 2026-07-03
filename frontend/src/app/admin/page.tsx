"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck, Search, Trash2, Ban, CheckCircle2, RotateCcw,
  LogOut, AlertTriangle, User as UserIcon, FileText, Flag, X,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// The admin key is held only for this tab's session (cleared when the tab closes)
// and sent as the x-admin-key header on every admin request.
const KEY_STORAGE = "ius_admin_key";

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
  reporter: string;
  reported_user: string;
  reported_display_name: string;
  reason: string;
  status: string;
  created_at: string;
}

type Tab = "users" | "reports" | "posts";

function adminReq<T>(key: string, path: string, options?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...options, headers: { "x-admin-key": key, ...options?.headers } });
}

export default function AdminPage() {
  const [key, setKey] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Restore a saved key on mount and confirm it still works.
  useEffect(() => {
    const saved = sessionStorage.getItem(KEY_STORAGE);
    if (!saved) { setChecking(false); return; }
    adminReq(saved, "/api/admin/users?limit=1")
      .then(() => setKey(saved))
      .catch(() => sessionStorage.removeItem(KEY_STORAGE))
      .finally(() => setChecking(false));
  }, []);

  function signOut() {
    sessionStorage.removeItem(KEY_STORAGE);
    setKey(null);
  }

  if (checking) {
    return <div className="min-h-screen bg-background" />;
  }
  if (!key) {
    return <AdminGate onUnlock={(k) => { sessionStorage.setItem(KEY_STORAGE, k); setKey(k); }} />;
  }
  return <AdminPanel adminKey={key} onSignOut={signOut} />;
}

// ── Key gate ──────────────────────────────────────────────────────────────────

function AdminGate({ onUnlock }: { onUnlock: (key: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await adminReq(value.trim(), "/api/admin/users?limit=1");
      onUnlock(value.trim());
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "Invalid admin key." : "Could not verify key.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-3">
            <ShieldCheck className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-on-surface">Admin access</h1>
          <p className="text-sm text-on-surface-variant mt-1">Enter the admin key to manage IUSConnect.</p>
        </div>
        <form onSubmit={submit} className="bg-surface rounded-2xl shadow-sm p-5 space-y-3">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Admin key"
            autoFocus
            className="w-full h-12 px-4 text-sm rounded-2xl bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {error && <p className="text-xs text-error px-1">{error}</p>}
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-all"
          >
            {loading ? "Checking…" : "Unlock"}
          </button>
        </form>
        <div className="text-center mt-4">
          <Link href="/feed" className="text-xs text-on-surface-variant hover:text-on-surface no-underline">← Back to app</Link>
        </div>
      </div>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function AdminPanel({ adminKey, onSignOut }: { adminKey: string; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("users");
  const [banner, setBanner] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setBanner(msg);
    setTimeout(() => setBanner(null), 3000);
  }, []);

  return (
    <main className="max-w-xl mx-auto px-4 pt-5 pb-16">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-on-surface">Admin</h1>
        </div>
        <button onClick={onSignOut} className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors">
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>

      {banner && (
        <div className="mb-3 rounded-xl bg-primary/10 text-primary text-sm px-4 py-2.5 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {banner}
        </div>
      )}

      {/* Tabs — segmented control */}
      <div className="flex gap-1 p-1 bg-surface-container rounded-full mb-4">
        {([["users", "Users", UserIcon], ["reports", "Reports", Flag], ["posts", "Posts", FileText]] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-full transition-all",
              tab === k ? "bg-surface text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab adminKey={adminKey} flash={flash} />}
      {tab === "reports" && <ReportsTab adminKey={adminKey} flash={flash} />}
      {tab === "posts" && <PostsTab adminKey={adminKey} flash={flash} />}
    </main>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

const USER_FILTERS = [["all", "All"], ["unverified", "Unverified"], ["banned", "Banned"], ["admins", "Admins"]] as const;

function UsersTab({ adminKey, flash }: { adminKey: string; flash: (m: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminReq<AdminUser[]>(adminKey, `/api/admin/users?q=${encodeURIComponent(q)}&filter=${filter}`)
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminKey, q, filter]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function act(u: AdminUser, action: "verify" | "ban" | "unban" | "delete") {
    try {
      if (action === "verify") {
        await adminReq(adminKey, `/api/admin/users/${u.username}/verify`, { method: "POST" });
        flash(`Verified @${u.username}`);
      } else if (action === "ban") {
        const reason = window.prompt(`Ban @${u.username} — reason?`);
        if (reason === null) return;
        await adminReq(adminKey, `/api/admin/users/${u.username}/ban`, { method: "POST", body: JSON.stringify({ reason }) });
        flash(`Banned @${u.username}`);
      } else if (action === "unban") {
        await adminReq(adminKey, `/api/admin/users/${u.username}/unban`, { method: "POST" });
        flash(`Unbanned @${u.username}`);
      } else if (action === "delete") {
        if (!window.confirm(`Permanently delete @${u.username}? This cannot be undone.`)) return;
        await adminReq(adminKey, `/api/admin/users/${u.username}`, { method: "DELETE" });
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

function ReportsTab({ adminKey, flash }: { adminKey: string; flash: (m: string) => void }) {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminReq<AdminReport[]>(adminKey, "/api/admin/reports?status=pending")
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminKey]);

  useEffect(() => { load(); }, [load]);

  async function dismiss(id: string) {
    try {
      await adminReq(adminKey, `/api/admin/reports/${id}/dismiss`, { method: "POST" });
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
      await adminReq(adminKey, `/api/admin/users/${username}/ban`, { method: "POST", body: JSON.stringify({ reason }) });
      flash(`Banned @${username}`);
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
                <Link href={`/profile/${r.reported_user}`} className="font-semibold text-primary no-underline">@{r.reported_user}</Link>
              </div>
              <p className="text-sm text-on-surface-variant mt-1 whitespace-pre-wrap">{r.reason}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <ActionBtn onClick={() => banReported(r.reported_user)} icon={Ban} label="Ban user" tone="danger" />
            <ActionBtn onClick={() => dismiss(r.id)} icon={X} label="Dismiss" tone="neutral" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Posts tab ─────────────────────────────────────────────────────────────────

function PostsTab({ adminKey, flash }: { adminKey: string; flash: (m: string) => void }) {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminReq<AdminPost[]>(adminKey, `/api/admin/posts?q=${encodeURIComponent(q)}`)
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminKey, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function del(id: string) {
    if (!window.confirm("Delete this post? It will be hidden from all users.")) return;
    try {
      await adminReq(adminKey, `/api/admin/posts/${id}`, { method: "DELETE" });
      flash("Post deleted");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed.");
    }
  }

  return (
    <div>
      <SearchBar value={q} onChange={setQ} placeholder="Search post text…" />
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
