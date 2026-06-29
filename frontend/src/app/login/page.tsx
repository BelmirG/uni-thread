"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: "email" | "password") {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(form),
      });
      router.push("/feed");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: "0.5rem",
    fontSize: "1rem",
    border: "1px solid #ccc",
    borderRadius: 4,
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <main style={{ padding: "2rem", maxWidth: 400 }}>
      <h1>Log in</h1>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
      >
        <input
          type="email"
          placeholder="you@student.ius.edu.ba"
          value={form.email}
          onChange={update("email")}
          style={inputStyle}
          required
        />

        <div style={{ position: "relative" }}>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={form.password}
            onChange={update("password")}
            style={{ ...inputStyle, paddingRight: "2.8rem" }}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: "0.82rem", padding: "0.2rem 0.3rem" }}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        {error && (
          <p style={{ color: "crimson", margin: 0, fontSize: "0.9rem" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: "0.6rem", fontSize: "1rem", cursor: "pointer" }}
        >
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
        No account? <Link href="/register">Register</Link>
      </p>
    </main>
  );
}
