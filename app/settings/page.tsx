"use client";

import { useEffect, useState } from "react";
import { getAuthHeaders, supabaseBrowser } from "@/lib/supabase-browser";

type AnalyticsData = {
  dailyUsers: number;
  messagesPerUser: number;
  dropOffPoints: Array<{ createdAt: string; reason: string }>;
  dailySeries: Array<{ date: string; users: number; messages: number }>;
  goalUsage?: Record<string, number>;
};

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
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
            `/api/preferences?${new URLSearchParams({ userId: user.id }).toString()}`,
            {
              cache: "no-store",
              headers: await getAuthHeaders()
            }
          );
          const preferencesData = await preferencesRes.json();
          if (preferencesRes.ok) {
            setMemoryItems(preferencesData.memoryItems || []);
          }
        }

        const analyticsRes = await fetch(
          `/api/analytics?${new URLSearchParams({ userId: user?.id || "" }).toString()}`,
          {
            cache: "no-store",
            headers: await getAuthHeaders()
          }
        );
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
      await fetch("/api/logout", {
        method: "POST",
        headers: await getAuthHeaders()
      });
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
      method: "DELETE",
      headers: await getAuthHeaders()
    });
    const data = await res.json();
    if (res.ok) {
      setMemoryItems(data.memoryItems || []);
    }
  }

  const chartBarStyle = (value: number, color: string): React.CSSProperties => ({
    width: 18,
    borderRadius: 999,
    background: color,
    height: Math.max(8, value),
    alignSelf: "end"
  });

  return (
    <div className="app-page">
      <div className="page-container">
        <a href="/" className="page-back">
          ← Back to Chat
        </a>

        <div className="hero-panel">
          <div className="hero-eyebrow">Workspace Settings</div>
          <h1 className="hero-title">Control memory, analytics, and account access.</h1>
          <p className="hero-copy">
            This is the operator view for Nexa. Manage who you are to the model,
            monitor usage patterns, and keep account state under control.
          </p>
        </div>

        <div className="page-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <section className="surface-card">
              <h2>Analytics Dashboard</h2>

              {!analytics ? (
                <div className="muted-copy">Loading analytics...</div>
              ) : (
                <>
                  <div className="stats-grid" style={{ marginBottom: 18 }}>
                    <div className="stat-card">
                      <div className="stat-label">Daily users</div>
                      <div className="stat-value">{analytics.dailyUsers}</div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-label">Messages per user</div>
                      <div className="stat-value">{analytics.messagesPerUser}</div>
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
                      marginBottom: 18,
                      minHeight: 180
                    }}
                  >
                    {analytics.dailySeries.map((point) => (
                      <div
                        key={point.date}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 8
                        }}
                      >
                        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 140 }}>
                          <div style={chartBarStyle(point.users * 18, "#46c2ff")} title={`Users: ${point.users}`} />
                          <div style={chartBarStyle(point.messages * 10, "#73f0c6")} title={`Messages: ${point.messages}`} />
                        </div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>
                          {new Date(point.date).toLocaleDateString(undefined, {
                            weekday: "short"
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 18, color: "#9ca3af", fontSize: 13 }}>
                    <span>Blue: daily users</span>
                    <span>Green: messages</span>
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                    Most used goals
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                    {Object.entries(analytics.goalUsage || {}).length === 0 ? (
                      <div className="muted-copy">No goal-selection events yet.</div>
                    ) : (
                      Object.entries(analytics.goalUsage || {})
                        .sort((a, b) => b[1] - a[1])
                        .map(([goal, count]) => (
                          <div
                            key={goal}
                            style={{
                              background: "#2a2a2a",
                              border: "1px solid #3a3a3a",
                              borderRadius: 14,
                              padding: "10px 12px"
                            }}
                          >
                            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>
                              {goal}
                            </div>
                            <div style={{ fontWeight: 700 }}>{count}</div>
                          </div>
                        ))
                    )}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                    Recent drop-off points
                  </div>

                  {analytics.dropOffPoints.length === 0 ? (
                    <div className="muted-copy">No recent drop-off points.</div>
                  ) : (
                    analytics.dropOffPoints.map((point) => (
                      <div
                        key={`${point.createdAt}-${point.reason}`}
                        style={{
                          background: "#2a2a2a",
                          border: "1px solid #3a3a3a",
                          borderRadius: 14,
                          padding: 14,
                          marginBottom: 12
                        }}
                      >
                        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                          {new Date(point.createdAt).toLocaleString()}
                        </div>
                        <div>{point.reason}</div>
                      </div>
                    ))
                  )}
                </>
              )}
            </section>

            <section className="surface-card">
              <h2>Remembered About You</h2>

              {memoryItems.length === 0 ? (
                <div className="muted-copy">
                  No saved memories yet. Tell Nexa things naturally in chat, like
                  “I am a PM student”.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {memoryItems.map((item) => (
                    <div key={item.id} className="memory-chip">
                      <span>{item.content}</span>
                      <button onClick={() => void forgetMemoryItem(item.id)}>Forget</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <section className="surface-card">
              <h2>Account</h2>

              {loading ? (
                <div className="muted-copy">Loading account...</div>
              ) : !userId ? (
                <>
                  <div className="muted-copy" style={{ marginBottom: 16 }}>
                    You are not logged in. Sign in to keep memory, sharing, and analytics tied
                    to your account instead of a guest session.
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <a href="/login" className="button">
                      Login
                    </a>
                    <a href="/signup" className="button">
                      Sign Up
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      background: "#2a2a2a",
                      border: "1px solid #3a3a3a",
                      borderRadius: 14,
                      padding: 14,
                      marginBottom: 16
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                      Logged in as
                    </div>
                    <div>{userEmail || "Logged in"}</div>
                  </div>

                  <button onClick={handleLogout} className="button danger">
                    Logout
                  </button>
                </>
              )}
            </section>

            <section className="surface-card">
              <h2>Workspace Notes</h2>
              <div className="muted-copy">
                Shared chats are public snapshots. Memory items are private. Analytics are meant
                to help you understand usage and friction points without adding noise to the main
                chat experience.
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
