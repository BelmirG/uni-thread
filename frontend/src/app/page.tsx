"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  Newspaper,
  HelpCircle,
  Users,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface HealthResponse {
  status: string;
  database: string;
}

const FEATURES = [
  {
    icon: Newspaper,
    title: "Campus Feed",
    text: "See what's happening at IUS — posts, polls, and photos from students, ranked so the good stuff surfaces.",
  },
  {
    icon: HelpCircle,
    title: "Anonymous Q&A",
    text: "Ask the questions you'd never ask out loud. Your identity stays sealed off from the post — by design.",
  },
  {
    icon: Users,
    title: "Clubs",
    text: "Join student clubs, post in their feeds, and chat with members in real time.",
  },
  {
    icon: MessageSquare,
    title: "Messages",
    text: "Private conversations with classmates — photos, files, and read receipts included.",
  },
];

export default function Home() {
  const router = useRouter();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [checkedHealth, setCheckedHealth] = useState(false);

  // Signed-in students skip the pitch and land in their feed.
  useEffect(() => {
    apiFetch("/api/auth/me")
      .then(() => router.replace("/feed"))
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    apiFetch<HealthResponse>("/api/health")
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setCheckedHealth(true));
  }, []);

  const healthy = health?.status === "ok" && health?.database === "connected";

  return (
    <main className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-10">
          {/* Hero */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-1">
              <GraduationCap className="w-9 h-9 text-primary-foreground" />
            </div>
            <h1 className="font-headline text-[2rem] leading-tight tracking-tight sm:text-headline-xl text-foreground">
              Your campus,
              <br />
              connected.
            </h1>
            <p className="text-muted-foreground text-body-md max-w-sm mx-auto">
              UniConnect is the private social network for International
              University of Sarajevo students. No outsiders, no noise — just
              your campus.
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-3">
            <Button asChild size="lg" className="w-full rounded-full h-12 text-base">
              <Link href="/register">Join with your student email</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full rounded-full h-12 text-base">
              <Link href="/login">Log in</Link>
            </Button>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <span>Exclusively for @student.ius.edu.ba accounts</span>
            </div>
          </div>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="bg-surface border border-outline-variant rounded-xl px-4 py-4"
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="font-semibold text-sm text-on-surface">{title}</span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* System status */}
      <footer className="pb-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        {!checkedHealth ? (
          <span>&nbsp;</span>
        ) : healthy ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            <span>All systems operational</span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
            <span>Service degraded — some features may be unavailable</span>
          </>
        )}
      </footer>
    </main>
  );
}
