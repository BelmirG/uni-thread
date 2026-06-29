"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface FormState {
  email: string;
  username: string;
  display_name: string;
  password: string;
}

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>({
    email: "",
    username: "",
    display_name: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  function update(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <main style={{ padding: "2rem", maxWidth: 480 }}>
        <h1>Check your email</h1>
        <p>
          A verification link was sent to <strong>{form.email}</strong>.
        </p>
        <p style={{ color: "#555", fontSize: "0.9rem" }}>
          Running locally? The link is printed in your backend container logs:
        </p>
        <pre
          style={{
            background: "#f4f4f4",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "0.75rem",
            fontSize: "0.85rem",
          }}
        >
          docker compose logs backend
        </pre>
      </main>
    );
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
      <h1>Create account</h1>
      <p style={{ color: "#666", fontSize: "0.9rem", marginTop: 0 }}>
        Only <code>@student.ius.edu.ba</code> addresses are accepted.
      </p>

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
        <input
          type="text"
          placeholder="Username (letters, numbers, _)"
          value={form.username}
          onChange={update("username")}
          style={inputStyle}
          required
        />
        <input
          type="text"
          placeholder="Display name"
          value={form.display_name}
          onChange={update("display_name")}
          style={inputStyle}
          required
        />

        <div style={{ position: "relative" }}>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password (min 8 characters)"
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
          {loading ? "Creating account…" : "Register"}
        </button>
      </form>

      <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
