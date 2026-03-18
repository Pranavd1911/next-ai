"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function SettingsPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserEmail(user.email || null);
      setLoading(false);
    }

    loadUser();
  }, []);

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function clearAllChats() {
    const {
      data: { user }
    } = await supabaseBrowser.auth.getUser();

    if (!user?.id) return;

    const confirmed = window.confirm(
      "Delete all chats? This cannot be undone."
    );
    if (!confirmed) return;

    const res = await fetch("/api/clear-all", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId: user.id
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data?.error || "Failed to clear chats.");
      return;
    }

    alert("All chats cleared.");
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#212121",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#212121",
        color: "white",
        padding: 24,
        fontFamily: "Arial, sans-serif"
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <a
          href="/"
          style={{
            color: "#cbd5e1",
            textDecoration: "none",
            display: "inline-block",
            marginBottom: 20
          }}
        >
          ← Back to Chat
        </a>

        <h1 style={{ marginTop: 0 }}>Settings</h1>

        <div
          style={{
            background: "#171717",
            border: "1px solid #2f2f2f",
            borderRadius: 14,
            padding: 20,
            marginBottom: 18
          }}
        >
          <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 8 }}>
            Account
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {userEmail || "Logged in"}
          </div>
        </div>

        <div
          style={{
            background: "#171717",
            border: "1px solid #2f2f2f",
            borderRadius: 14,
            padding: 20,
            marginBottom: 18
          }}
        >
          <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 12 }}>
            Data
          </div>
          <button
            onClick={clearAllChats}
            style={{
              background: "#3a1f1f",
              color: "white",
              border: "1px solid #5a2d2d",
              borderRadius: 10,
              padding: "10px 14px",
              cursor: "pointer"
            }}
          >
            Clear All Chats
          </button>
        </div>

        <div
          style={{
            background: "#171717",
            border: "1px solid #2f2f2f",
            borderRadius: 14,
            padding: 20
          }}
        >
          <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 12 }}>
            Session
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: "#2b3445",
              color: "white",
              border: "1px solid #3b465a",
              borderRadius: 10,
              padding: "10px 14px",
              cursor: "pointer"
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}