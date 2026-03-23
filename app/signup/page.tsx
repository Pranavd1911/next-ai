"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const form = e.currentTarget;
    const email = (form.email as HTMLInputElement).value.trim();
    const password = (form.password as HTMLInputElement).value;

    const redirectUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://next-ai-git-main-pranavd1911s-projects.vercel.app";

    const { error } = await supabaseBrowser.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess("Check your email to confirm your account.");
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <div className="auth-card">
          <div className="hero-eyebrow">Nexa AI</div>
          <h1 className="hero-title">Create your production workspace.</h1>
          <p className="hero-copy">
            Get persistent memory, shareable chats, research with citations, voice chat,
            and synced preferences across sessions.
          </p>

          <ul className="auth-list">
            <li>Keep context across chats without re-explaining yourself</li>
            <li>Upload files, analyze images, and switch into code mode instantly</li>
            <li>Track usage trends and manage saved memory from one place</li>
          </ul>
        </div>

        <div className="auth-card">
          <div className="hero-eyebrow">Create Account</div>
          <h2 style={{ marginTop: 16, marginBottom: 8 }}>Sign Up</h2>
          <p className="muted-copy" style={{ marginTop: 0, marginBottom: 18 }}>
            Create your Nexa account and confirm it from your email.
          </p>

          <form onSubmit={handleSignup} className="auth-form">
            <label className="field">
              <span className="field-label">Email</span>
              <input className="field-input" name="email" type="email" placeholder="you@example.com" required />
            </label>

            <label className="field">
              <span className="field-label">Password</span>
              <input
                className="field-input"
                name="password"
                type="password"
                placeholder="At least 6 characters"
                required
                minLength={6}
              />
            </label>

            {error && <div className="inline-message error">{error}</div>}
            {success && <div className="inline-message success">{success}</div>}

            <button type="submit" disabled={loading}>
              {loading ? "Signing up..." : "Create account"}
            </button>

            <a href="/login" className="muted small">
              Already have an account? Login
            </a>
          </form>
        </div>
      </div>
    </div>
  );
}
