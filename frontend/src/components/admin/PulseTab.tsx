"use client";

// Campus Pulse — weekly LLM report (graduation-project feature, campus-pulse branch only).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, TrendingUp, TrendingDown, ArrowRight, Sparkles, Copy, RefreshCw, Loader2,
  ShieldCheck, AlertTriangle, Check,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PulseTopic {
  rank: number; name: string; students: number; posts: number;
  mood: "positive" | "neutral" | "negative" | "mixed";
  trend: Trend; previous_students: number | null; summary: string;
}
interface PulseComplaint {
  rank: number; problem: string; area: string; students: number; posts: number;
  trend: Trend; previous_students: number | null; summary: string;
}
type Trend = "new" | "rising" | "falling" | "steady" | "unknown";
interface PulseReportData {
  week_start: string; week_end: string; min_students: number;
  topics: PulseTopic[]; complaints: PulseComplaint[];
  going_well: { name: string; students: number; summary: string }[];
  hidden_below_threshold: { topics: number; complaints: number };
}
interface PulseStats {
  posts_analyzed: number; students: number; llm_calls: number; duration_seconds: number;
  redactions: number; sources: { feed: number; club: number; anonymous: number };
}
interface PulseRow {
  week_start: string; status: "running" | "done" | "failed"; model: string;
  started_at: string | null; finished_at: string | null; error: string | null;
  report?: PulseReportData | null; stats?: PulseStats | null;
}
interface PulseStatus {
  model: string; llm: { reachable: boolean; model_available: boolean };
  running_week: string | null; last_completed_week: string; min_students: number;
}

const MOOD: Record<PulseTopic["mood"], string> = {
  positive: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  neutral: "bg-surface-container text-on-surface-variant",
  negative: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  mixed: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};

function fmtDay(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  return m ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
}

function recentMondays(lastCompleted: string, n = 8): string[] {
  const base = new Date(lastCompleted + "T00:00:00Z");
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    return d.toISOString().slice(0, 10);
  });
}

function TrendChip({ trend, previous }: { trend: Trend; previous: number | null }) {
  if (trend === "unknown") return null;
  const map = {
    new: { icon: Sparkles, label: "new", cls: "text-primary" },
    rising: { icon: TrendingUp, label: `rising (was ${previous})`, cls: "text-rose-600 dark:text-rose-400" },
    falling: { icon: TrendingDown, label: `falling (was ${previous})`, cls: "text-emerald-600 dark:text-emerald-400" },
    steady: { icon: ArrowRight, label: "steady", cls: "text-on-surface-variant" },
  }[trend];
  const Icon = map.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", map.cls)}>
      <Icon className="w-3 h-3" /> {map.label}
    </span>
  );
}

function asText(row: PulseRow): string {
  const r = row.report!;
  const lines = [
    `Campus Pulse — week of ${fmtDay(r.week_start)} – ${fmtDay(r.week_end)}`,
    "",
    "TOP TOPICS",
    ...r.topics.map((t) => `${t.rank}. ${t.name} — ${t.students} students, ${t.mood}${t.trend !== "unknown" ? `, ${t.trend}` : ""}\n   ${t.summary}`),
    "",
    "TOP COMPLAINTS",
    ...r.complaints.map((c) => `${c.rank}. ${c.problem} [${c.area}] — ${c.students} students${c.trend !== "unknown" ? `, ${c.trend}` : ""}\n   ${c.summary}`),
  ];
  if (r.going_well.length) {
    lines.push("", "WHAT'S GOING WELL", ...r.going_well.map((g) => `• ${g.name}: ${g.summary}`));
  }
  lines.push("", `Only topics raised by at least ${r.min_students} different students are shown. No names, quotes or private content.`);
  return lines.join("\n");
}

export default function PulseTab() {
  const [status, setStatus] = useState<PulseStatus | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [rows, setRows] = useState<PulseRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PulseRow | null>(null);
  const [generateWeek, setGenerateWeek] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadList = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        apiFetch<PulseStatus>("/api/admin/pulse/status"),
        apiFetch<PulseRow[]>("/api/admin/pulse/reports"),
      ]);
      setStatus(s);
      setRows(list);
      setGenerateWeek((w) => w || s.last_completed_week);
      setSelected((cur) => cur ?? list.find((r) => r.status === "done")?.week_start ?? null);
      return s;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setDisabled(true);
      return null;
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    apiFetch<PulseRow>(`/api/admin/pulse/reports/${selected}`).then(setDetail).catch(() => setDetail(null));
  }, [selected, rows]);

  // While a report is generating, check every 5 s and refresh when it's done.
  useEffect(() => {
    if (!status?.running_week) return;
    pollRef.current = setInterval(async () => {
      const s = await loadList();
      if (s && !s.running_week) {
        if (pollRef.current) clearInterval(pollRef.current);
        setSelected(status.running_week);
      }
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status?.running_week, loadList]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setError(null);
    try {
      await apiFetch("/api/admin/pulse/generate", { method: "POST", body: JSON.stringify({ week_start: generateWeek }) });
      await loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the report.");
    }
  }

  async function copyReport() {
    if (!detail?.report) return;
    await navigator.clipboard.writeText(asText(detail));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (disabled) {
    return (
      <div className="bg-surface rounded-2xl shadow-sm p-5 text-sm text-on-surface-variant">
        Campus Pulse is turned off on this server (<code>PULSE_ENABLED=false</code>).
      </div>
    );
  }
  if (!status) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-on-surface-variant" /></div>;

  const llmOk = status.llm.reachable && status.llm.model_available;
  const report = detail?.status === "done" ? detail.report : null;

  return (
    <div className="space-y-3">
      {/* What this is */}
      <div className="bg-surface rounded-2xl shadow-sm p-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-on-surface">Campus Pulse</h2>
        </div>
        <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
          A weekly summary of what students discuss and complain about, written by an AI model from the
          feed, public clubs and the anonymous board. It never reads direct messages, club chat or private
          clubs. A topic appears only when at least {status.min_students} different students raised it,
          and reports never contain names or quotes.
        </p>
        <div className="flex items-center gap-1.5 mt-2.5 text-xs">
          <span className={cn("w-2 h-2 rounded-full", llmOk ? "bg-emerald-500" : "bg-rose-500")} />
          <span className="text-on-surface-variant">
            Model <span className="font-medium text-on-surface">{status.model}</span> (local, Ollama) ·{" "}
            {llmOk ? "ready" : status.llm.reachable ? "model not downloaded" : "not reachable"}
          </span>
        </div>
      </div>

      {/* Generate */}
      <div className="bg-surface rounded-2xl shadow-sm p-4">
        {status.running_week ? (
          <div className="flex items-center gap-2 text-sm text-on-surface">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Generating the report for the week of {fmtDay(status.running_week)}… this takes a few minutes on the local model.
          </div>
        ) : (
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={generateWeek}
              onChange={(e) => setGenerateWeek(e.target.value)}
              className="flex-1 min-w-0 h-10 px-3 text-sm rounded-xl bg-surface-container-low text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {recentMondays(status.last_completed_week).map((w) => {
                const existing = rows.find((r) => r.week_start === w);
                return (
                  <option key={w} value={w}>
                    Week of {fmtDay(w)}{existing ? ` — ${existing.status === "done" ? "has report" : existing.status}` : ""}
                  </option>
                );
              })}
            </select>
            <button
              onClick={generate}
              disabled={!llmOk}
              className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              {rows.some((r) => r.week_start === generateWeek) ? "Regenerate" : "Generate"}
            </button>
          </div>
        )}
        {error && <p className="text-xs text-error mt-2">{error}</p>}
      </div>

      {/* Report picker */}
      {rows.some((r) => r.status !== "running") && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {rows.filter((r) => r.status !== "running").map((r) => (
            <button
              key={r.week_start}
              onClick={() => setSelected(r.week_start)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                selected === r.week_start ? "bg-primary text-primary-foreground" : "bg-surface-container text-on-surface-variant hover:text-on-surface",
                r.status === "failed" && selected !== r.week_start && "text-error",
              )}
            >
              {fmtDay(r.week_start)}{r.status === "failed" ? " · failed" : ""}
            </button>
          ))}
        </div>
      )}

      {detail?.status === "failed" && (
        <div className="bg-surface rounded-2xl shadow-sm p-4 text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
          <div><span className="font-semibold text-on-surface">This report failed.</span>{" "}
            <span className="text-on-surface-variant">{detail.error}</span></div>
        </div>
      )}

      {report && detail?.stats && (
        <>
          <div className="flex items-start justify-between gap-2 px-1">
            <div>
              <div className="font-bold text-on-surface">Week of {fmtDay(report.week_start)} – {fmtDay(report.week_end)}</div>
              <div className="text-xs text-on-surface-variant mt-0.5">
                {detail.stats.posts_analyzed} posts from {detail.stats.students} students · {detail.stats.llm_calls} AI calls · {fmtDuration(detail.stats.duration_seconds)}
              </div>
            </div>
            <button
              onClick={copyReport}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-full bg-surface-container text-xs font-semibold text-on-surface-variant hover:text-on-surface"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy as text"}
            </button>
          </div>

          <Section title="Top 5 topics" empty={report.topics.length === 0}>
            {report.topics.map((t) => (
              <Row key={t.rank} rank={t.rank}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-on-surface">{t.name}</span>
                  <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", MOOD[t.mood])}>{t.mood}</span>
                  <TrendChip trend={t.trend} previous={t.previous_students} />
                </div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">{t.students} students · {t.posts} posts</div>
                {t.summary && <p className="text-sm text-on-surface-variant mt-1">{t.summary}</p>}
              </Row>
            ))}
          </Section>

          <Section title="Top 5 complaints" empty={report.complaints.length === 0}>
            {report.complaints.map((c) => (
              <Row key={c.rank} rank={c.rank}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-on-surface">{c.problem}</span>
                  <TrendChip trend={c.trend} previous={c.previous_students} />
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{c.area}</span>
                  <span className="text-[11px] text-on-surface-variant">{c.students} students · {c.posts} posts</span>
                </div>
                {c.summary && <p className="text-sm text-on-surface-variant mt-1">{c.summary}</p>}
              </Row>
            ))}
          </Section>

          {report.going_well.length > 0 && (
            <Section title="What's going well">
              {report.going_well.map((g) => (
                <div key={g.name} className="text-sm">
                  <span className="font-semibold text-on-surface">{g.name}</span>
                  <span className="text-on-surface-variant"> — {g.summary}</span>
                </div>
              ))}
            </Section>
          )}

          <div className="flex gap-2 px-1 text-[11px] text-on-surface-variant leading-relaxed">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              {report.hidden_below_threshold.topics} smaller topics and {report.hidden_below_threshold.complaints} smaller
              complaints were withheld because fewer than {report.min_students} students raised them.
              Read from: {detail.stats.sources.feed} feed, {detail.stats.sources.club} public-club and{" "}
              {detail.stats.sources.anonymous} anonymous-board posts. Generated by {detail.model}.
            </span>
          </div>
        </>
      )}

      {!report && rows.length === 0 && (
        <div className="bg-surface rounded-2xl shadow-sm p-5 text-sm text-on-surface-variant text-center">
          No reports yet. Generate one above, or wait for the weekly run.
        </div>
      )}
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl shadow-sm p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-on-surface-variant mb-3">{title}</h3>
      {empty ? <p className="text-sm text-on-surface-variant">Nothing raised by enough students this week.</p>
        : <div className="space-y-3">{children}</div>}
    </div>
  );
}

function Row({ rank, children }: { rank: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 flex-shrink-0 rounded-full bg-surface-container flex items-center justify-center text-xs font-bold text-on-surface">{rank}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
