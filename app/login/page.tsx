"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!email || !password) {
      setError("Enter both email and password.");
      return;
    }

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      window.location.href = "/";
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      return;
    }

    if (data.user && !data.session) {
      setMessage("Account created. Check your email if confirmation is enabled in Supabase.");
    } else {
      setMessage("Account created and signed in.");
      window.location.href = "/";
    }
  }

  return (
    <main className="login-shell">
      <div className="login-card stack">
        <div>
          <h1 style={{ margin: 0 }}>{mode === "login" ? "Login" : "Create account"}</h1>
          <p className="muted small" style={{ marginTop: 8 }}>
            For fastest testing, disable email confirmation in Supabase Auth or configure your auth email flow correctly.
          </p>
        </div>

        {message ? <div className="notice">{message}</div> : null}
        {error ? <div className="error">{error}</div> : null}

        <form onSubmit={handleSubmit} className="stack">
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>

          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" />
          </label>

          <button className="button primary" type="submit">
            {mode === "login" ? "Login" : "Create account"}
          </button>
        </form>

        <button className="button ghost" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Login"}
        </button>

        <Link href="/" className="button ghost" style={{ textAlign: "center" }}>
          Continue in guest mode
        </Link>
      </div>
    </main>
  );
}
