"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();

      setUserId(user?.id || null);
      setUserEmail(user?.email || null);
      setLoading(false);
    }

    init();

    const {
      data: { subscription }
    } = supabaseBrowser.auth.onAuthStateChange(async (_event, session) => {
      setUserId(session?.user?.id || null);
      setUserEmail(session?.user?.email || null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    try {
      await supabaseBrowser.auth.signOut();
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/";
    } catch {
      alert("Logout failed");
    }
  }

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#121212",
    color: "white",
    fontFamily: "Arial, sans-serif",
    padding: 24
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: 760,
    margin: "0 auto"
  };

  const cardStyle: React.CSSProperties = {
    background: "#1f1f1f",
    border: "1px solid #333",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16
  };

  const primaryButtonStyle: React.CSSProperties = {
    background: "#2b3445",
    color: "white",
    border: "1px solid #3b465a",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-block",
    fontSize: 14
  };

  const dangerButtonStyle: React.CSSProperties = {
    background: "#3a1f1f",
    color: "white",
    border: "1px solid #5a2d2d",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: 14
  };

  const infoBoxStyle: React.CSSProperties = {
    background: "#2a2a2a",
    border: "1px solid #3a3a3a",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    wordBreak: "break-word"
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={{ marginBottom: 24 }}>
          <a href="/" style={primaryButtonStyle}>
            ← Back to Chat
          </a>
        </div>

        <h1 style={{ fontSize: 30, marginBottom: 20 }}>Settings</h1>

        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Account</h2>

          {loading ? (
            <div style={{ color: "#cbd5e1" }}>Loading account...</div>
          ) : !userId ? (
            <div>
              <div style={{ color: "#cbd5e1", marginBottom: 16 }}>
                You are not logged in.
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <a href="/login" style={primaryButtonStyle}>
                  Login
                </a>

                <a href="/signup" style={primaryButtonStyle}>
                  Sign Up
                </a>
              </div>
            </div>
          ) : (
            <div>
              <div style={infoBoxStyle}>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                  Logged in as
                </div>
                <div>{userEmail || "Logged in"}</div>
              </div>

              <button onClick={handleLogout} style={dangerButtonStyle}>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}