"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface HealthResponse {
  status: string;
  database: string;
}

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<HealthResponse>("/api/health")
      .then(setHealth)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const healthy = health?.status === "ok" && health?.database === "connected";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm text-center space-y-6">
        {/* Brand */}
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-bold mb-2">
            IUS
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">IUSConnect</h1>
          <p className="text-muted-foreground text-sm">
            Campus social network · IUS Sarajevo
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <Button asChild size="lg" className="w-full">
            <Link href="/register">Create account</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full">
            <Link href="/login">Log in</Link>
          </Button>
        </div>

        {/* Status dot */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          {loading ? (
            <span>Checking backend…</span>
          ) : error ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-destructive inline-block" />
              <span>Backend unreachable</span>
            </>
          ) : healthy ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              <span>All systems operational</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
              <span>Degraded</span>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
