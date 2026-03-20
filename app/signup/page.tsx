"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function SignupPage() {
  const [loading, setLoading] = useState(false);

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

    const form = e.currentTarget;
    const email = (form.email as HTMLInputElement).value.trim();
    const password = (form.password as HTMLInputElement).value;

    const redirectUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://next-ai-git-main-pranavd1911s-projects.vercel.app";

    const { error } = await supabaseBrowser.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });

    setLoading(false);

    if (error) {
      alert(error.message);
    } else {
      alert("Check your email to confirm your account.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#212121",
        color: "white",
        fontFamily: "Arial, sans-serif",
        padding: 20
      }}
    >
      <form
        onSubmit={handleSignup}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: "100%",
          maxWidth: 360,
          background: "#1f1f1f",
          border: "1px solid #333",
          borderRadius: 16,
          padding: 24,
          boxSizing: "border-box"
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 6 }}>Sign Up</h2>

        <div style={{ color: "#9ca3af", fontSize: 14, marginBottom: 8 }}>
          Create your NEXA AI account
        </div>

        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #444",
            background: "#2a2a2a",
            color: "white",
            outline: "none"
          }}
        />

        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          minLength={6}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #444",
            background: "#2a2a2a",
            color: "white",
            outline: "none"
          }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "none",
            background: "#2b3445",
            color: "white",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? "Signing up..." : "Sign Up"}
        </button>

        <a
          href="/login"
          style={{
            color: "#9ca3af",
            textDecoration: "none",
            fontSize: 14,
            textAlign: "center",
            marginTop: 4
          }}
        >
          Already have an account? Login
        </a>
      </form>
    </div>
  );
}