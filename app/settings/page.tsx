"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<{
    dailyUsers: number;
    messagesPerUser: number;
    dropOffPoints: Array<{ createdAt: string; reason: string }>;
    dailySeries: Array<{ date: string; users: number; messages: number }>;
  } | null>(null);
  const [memoryItems, setMemoryItems] = useState<Array<{ id: string; content: string }>>([]);

  useEffect(() => {
    async function init() {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();

      setUserId(user?.id || null);
      setUserEmail(user?.email || null);
      try {
        if (user?.id) {
          const preferencesRes = await fetch(
            `/api/preferences?${new URLSearchParams({
              userId: user.id
            }).toString()}`,
            { cache: "no-store" }
          );
          const preferencesData = await preferencesRes.json();
          if (preferencesRes.ok) {
            setMemoryItems(preferencesData.memoryItems || []);
          }
        }

        const analyticsRes = await fetch("/api/analytics", { cache: "no-store" });
        const analyticsData = await analyticsRes.json();
        if (analyticsRes.ok) {
          setAnalytics(analyticsData);
        }
      } catch {}
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

  async function forgetMemoryItem(memoryId: string) {
    if (!userId) return;

    const params = new URLSearchParams({
      userId,
      memoryId
    });

    const res = await fetch(`/api/preferences?${params.toString()}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (res.ok) {
      setMemoryItems(data.memoryItems || []);
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

  const chartBarStyle = (value: number, color: string): React.CSSProperties => ({
    width: 18,
    borderRadius: 999,
    background: color,
    height: Math.max(8, value),
    alignSelf: "end"
  });

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

        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Analytics Dashboard</h2>

          {!analytics ? (
            <div style={{ color: "#cbd5e1" }}>Loading analytics...</div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                <div style={infoBoxStyle}>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                    Daily users
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{analytics.dailyUsers}</div>
                </div>

                <div style={infoBoxStyle}>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                    Messages / user
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>
                    {analytics.messagesPerUser}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                7 day trend
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-end",
                  marginBottom: 20,
                  minHeight: 180
                }}
              >
                {analytics.dailySeries.map((point) => (
                  <div key={point.date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 140 }}>
                      <div style={chartBarStyle(point.users * 18, "#46c2ff")} title={`Users: ${point.users}`} />
                      <div style={chartBarStyle(point.messages * 10, "#73f0c6")} title={`Messages: ${point.messages}`} />
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                      {new Date(point.date).toLocaleDateString(undefined, { weekday: "short" })}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                Recent drop-off points
              </div>

              {analytics.dropOffPoints.length === 0 ? (
                <div style={{ color: "#cbd5e1" }}>No recent drop-off points.</div>
              ) : (
                analytics.dropOffPoints.map((point) => (
                  <div key={`${point.createdAt}-${point.reason}`} style={infoBoxStyle}>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                      {new Date(point.createdAt).toLocaleString()}
                    </div>
                    <div>{point.reason}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Remembered About You</h2>
          {memoryItems.length === 0 ? (
            <div style={{ color: "#cbd5e1" }}>
              No saved memories yet. Tell Nexa things naturally in chat, like “I am a PM student”.
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {memoryItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#2a2a2a",
                    border: "1px solid #3a3a3a",
                    borderRadius: 999,
                    padding: "8px 12px"
                  }}
                >
                  <span>{item.content}</span>
                  <button
                    onClick={() => void forgetMemoryItem(item.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#fca5a5",
                      cursor: "pointer"
                    }}
                  >
                    Forget
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
