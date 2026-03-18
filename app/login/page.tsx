"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
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

  async function handleLogin(e: any) {
    e.preventDefault();
    setLoading(true);

    const email = e.target.email.value;
    const password = e.target.password.value;

    const { error } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (error) {
      alert(error.message);
    } else {
      window.location.href = "/";
    }
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#212121",
        color: "white"
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: 300
        }}
      >
        <h2>Login</h2>

        <input
          name="email"
          placeholder="Email"
          required
          style={{
            padding: 10,
            borderRadius: 8,
            border: "1px solid #444",
            background: "#2a2a2a",
            color: "white"
          }}
        />

        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          style={{
            padding: 10,
            borderRadius: 8,
            border: "1px solid #444",
            background: "#2a2a2a",
            color: "white"
          }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 10,
            borderRadius: 8,
            border: "none",
            background: "#2b3445",
            color: "white",
            cursor: "pointer"
          }}
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        <a href="/signup" style={{ color: "#9ca3af" }}>
          Don’t have an account? Sign up
        </a>
      </form>
    </div>
  );
}