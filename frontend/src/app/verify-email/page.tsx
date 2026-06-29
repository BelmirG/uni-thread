"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setMessage("No verification token found in the URL.");
      setStatus("error");
      return;
    }
    apiFetch<{ message: string }>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((data) => { setMessage(data.message); setStatus("success"); })
      .catch((err: Error) => { setMessage(err.message); setStatus("error"); });
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-border shadow-sm p-8 text-center">
        {status === "loading" && (
          <>
            <Loader2 className="w-10 h-10 text-muted-foreground animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Verifying your email…</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-4" />
            <h1 className="text-lg font-bold text-foreground mb-1">Email verified</h1>
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors no-underline"
            >
              Continue to login
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
            <h1 className="text-lg font-bold text-foreground mb-1">Verification failed</h1>
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <Link
              href="/register"
              className="inline-flex items-center justify-center w-full h-10 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors no-underline"
            >
              Register again
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </main>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
