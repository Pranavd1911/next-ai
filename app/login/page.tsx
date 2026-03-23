"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();

      if (user) {
        window.location.href = "/";
      }
    }

    checkUser();
  }, []);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = e.currentTarget;
    const email = (form.email as HTMLInputElement).value.trim();
    const password = (form.password as HTMLInputElement).value;

    const { error } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/";
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <div className="auth-card">
          <div className="hero-eyebrow">Nexa AI</div>
          <h1 className="hero-title">Return to your workspace.</h1>
          <p className="hero-copy">
            Pick up where you left off with memory-aware chat, voice mode, file analysis,
            research answers with sources, and shareable conversations.
          </p>

          <ul className="auth-list">
            <li>Persistent memory and chat history across devices</li>
            <li>Voice chat, web research, code mode, and image reasoning</li>
            <li>Shareable chats and a private analytics dashboard</li>
          </ul>
        </div>

        <div className="auth-card">
          <div className="hero-eyebrow">Account Access</div>
          <h2 style={{ marginTop: 16, marginBottom: 8 }}>Login</h2>
          <p className="muted-copy" style={{ marginTop: 0, marginBottom: 18 }}>
            Sign in to sync your chats, preferences, and saved memory.
          </p>

          <form onSubmit={handleLogin} className="auth-form">
            <label className="field">
              <span className="field-label">Email</span>
              <input className="field-input" name="email" type="email" placeholder="you@example.com" required />
            </label>

            <label className="field">
              <span className="field-label">Password</span>
              <input className="field-input" name="password" type="password" placeholder="Your password" required />
            </label>

            {error && <div className="inline-message error">{error}</div>}

            <button type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>

            <a href="/signup" className="muted small">
              Don’t have an account? Create one
            </a>
          </form>
        </div>
      </div>
    </div>
  );
}
