"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getGuestId } from "@/lib/guest";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Msg = {
  role: string;
  content: string;
};

type ChatItem = {
  id: string;
  title: string;
};

type Segment =
  | { type: "markdown"; content: string }
  | { type: "code"; content: string };

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [history, setHistory] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("general");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [search, setSearch] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const guestId = typeof window !== "undefined" ? getGuestId() : null;

  async function migrateGuestChats(currentGuestId: string, currentUserId: string) {
    try {
      await fetch("/api/migrate-guest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          guestId: currentGuestId,
          userId: currentUserId
        })
      });
    } catch {}
  }

  async function loadHistory(currentUserId?: string | null) {
    const actualUserId = currentUserId ?? userId;
    const params = new URLSearchParams();

    if (actualUserId) {
      params.set("userId", actualUserId);
    } else if (guestId) {
      params.set("guestId", guestId);
    } else {
      setHistory([]);
      return;
    }

    const res = await fetch(`/api/history?${params.toString()}`);
    const data = await res.json();
    setHistory(Array.isArray(data) ? data : []);
  }

  async function loadChat(chatId: string) {
    const params = new URLSearchParams();
    params.set("chatId", chatId);

    if (userId) params.set("userId", userId);
    else if (guestId) params.set("guestId", guestId);

    const res = await fetch(`/api/chat-messages?${params.toString()}`);
    const data = await res.json();

    if (Array.isArray(data)) {
      setMessages(
        data.map((m: any) => ({
          role: m.role,
          content: m.content
        }))
      );
      setActiveChatId(chatId);
      if (isMobile) setSidebarOpen(false);
    }
  }

  useEffect(() => {
    async function init() {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();

      const currentUserId = user?.id || null;
      const currentUserEmail = user?.email || null;

      if (currentUserId && guestId) {
        await migrateGuestChats(guestId, currentUserId);
      }

      setUserId(currentUserId);
      setUserEmail(currentUserEmail);
      await loadHistory(currentUserId);
    }

    init();

    const {
      data: { subscription }
    } = supabaseBrowser.auth.onAuthStateChange(async (_event, session) => {
      const currentUserId = session?.user?.id || null;
      const currentUserEmail = session?.user?.email || null;

      if (currentUserId && guestId) {
        await migrateGuestChats(guestId, currentUserId);
      }

      setUserId(currentUserId);
      setUserEmail(currentUserEmail);

      if (!currentUserId) {
        setActiveChatId(null);
        setMessages([]);
      }

      await loadHistory(currentUserId);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth < 900;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(true);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => (h.title || "").toLowerCase().includes(q));
  }, [history, search]);

  async function streamAssistantReply(nextMessages: Msg[], response: Response) {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error("No response body found.");

    let accumulated = "";
    setMessages([...nextMessages, { role: "assistant", content: "" }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      accumulated += decoder.decode(value, { stream: true });

      setMessages([...nextMessages, { role: "assistant", content: accumulated }]);
    }
  }

  async function sendMessage(customMessages?: Msg[]) {
    const nextMessages = customMessages
      ? customMessages
      : [...messages, { role: "user", content: input }];

    if (!customMessages && !input.trim()) return;

    if (!customMessages) {
      setMessages(nextMessages);
      setInput("");
    }

    if (isMobile) setSidebarOpen(false);
    setLoading(true);

    try {
      if (mode === "image") {
        const imageRes = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages,
            mode,
            guestId,
            userId,
            chatId: activeChatId
          })
        });

        const imageData = await imageRes.json();
        const imageReply = imageData.url || imageData.error || "...";

        setMessages([...nextMessages, { role: "assistant", content: imageReply }]);

        if (imageData.chatId && !activeChatId) {
          setActiveChatId(imageData.chatId);
        }

        await loadHistory();
        return;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          mode,
          guestId,
          userId,
          chatId: activeChatId
        })
      });

      if (!res.ok) {
        let errorMessage = "Request failed.";
        try {
          const errorData = await res.json();
          errorMessage = errorData?.error || errorMessage;
        } catch {}
        setMessages([...nextMessages, { role: "assistant", content: errorMessage }]);
        return;
      }

      const returnedChatId = res.headers.get("X-Chat-Id");
      if (returnedChatId && !activeChatId) {
        setActiveChatId(returnedChatId);
      }

      await streamAssistantReply(nextMessages, res);
      await loadHistory();
    } catch {
      setMessages([...nextMessages, { role: "assistant", content: "Request failed." }]);
    } finally {
      setLoading(false);
    }
  }

  async function regenerateLastReply() {
    const trimmed = [...messages];
    if (!trimmed.length) return;
    if (trimmed[trimmed.length - 1]?.role === "assistant") trimmed.pop();
    await sendMessage(trimmed);
  }

  async function deleteChat(id: string) {
    const params = new URLSearchParams();
    params.set("id", id);

    if (userId) params.set("userId", userId);
    else if (guestId) params.set("guestId", guestId);

    await fetch(`/api/delete?${params.toString()}`, { method: "DELETE" });

    if (activeChatId === id) {
      setActiveChatId(null);
      setMessages([]);
    }

    await loadHistory();
  }

  async function clearAllChats() {
    const confirmed = window.confirm(
      "Are you sure you want to delete all chats? This cannot be undone."
    );
    if (!confirmed) return;

    try {
      const res = await fetch("/api/clear-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId,
          guestId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Failed to clear chats.");
        return;
      }

      setActiveChatId(null);
      setMessages([]);
      setHistory([]);
      await loadHistory();
    } catch {
      alert("Failed to clear chats.");
    }
  }

  async function renameChat(id: string, currentTitle: string) {
    const newTitle = window.prompt("Rename chat", currentTitle || "New Chat");
    if (!newTitle?.trim()) return;

    await fetch("/api/rename", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id,
        title: newTitle.trim(),
        userId,
        guestId
      })
    });

    await loadHistory();
  }

  async function handleLogout() {
    try {
      await supabaseBrowser.auth.signOut();
      await fetch("/api/logout", { method: "POST" });
      setUserId(null);
      setUserEmail(null);
      setActiveChatId(null);
      setMessages([]);
      setHistory([]);
      window.location.href = "/";
    } catch {
      alert("Logout failed");
    }
  }

  function newChat() {
    setMessages([]);
    setActiveChatId(null);
    if (isMobile) setSidebarOpen(false);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied");
    } catch {
      alert("Copy failed");
    }
  }

  function cleanMessageContent(content: string) {
    return content.replace(/\nCopy\s*\n/g, "\n");
  }

  function isLikelyCodeLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return false;

    return (
      trimmed.startsWith("def ") ||
      trimmed.startsWith("class ") ||
      trimmed.startsWith("import ") ||
      trimmed.startsWith("from ") ||
      trimmed.startsWith("print(") ||
      trimmed.startsWith("return ") ||
      trimmed.startsWith("for ") ||
      trimmed.startsWith("while ") ||
      trimmed.startsWith("if ") ||
      trimmed.startsWith("elif ") ||
      trimmed === "else:" ||
      trimmed.startsWith("try:") ||
      trimmed.startsWith("except") ||
      trimmed.startsWith("finally:") ||
      trimmed.startsWith("with ") ||
      trimmed.startsWith("let ") ||
      trimmed.startsWith("const ") ||
      trimmed.startsWith("function ") ||
      trimmed.includes(" = ") ||
      trimmed.includes("=>") ||
      trimmed.endsWith("{") ||
      trimmed.endsWith("}") ||
      /^[a-zA-Z_][a-zA-Z0-9_]*\(/.test(trimmed)
    );
  }

  function splitContentIntoSegments(content: string): Segment[] {
    const cleaned = cleanMessageContent(content);

    if (cleaned.includes("```")) {
      return [{ type: "markdown", content: cleaned }];
    }

    const lines = cleaned.split("\n");
    const segments: Segment[] = [];
    let markdownBuffer: string[] = [];
    let codeBuffer: string[] = [];

    function flushMarkdown() {
      const text = markdownBuffer.join("\n").trim();
      if (text) segments.push({ type: "markdown", content: text });
      markdownBuffer = [];
    }

    function flushCode() {
      const text = codeBuffer.join("\n").trim();
      if (text) segments.push({ type: "code", content: text });
      codeBuffer = [];
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "Copy") continue;

      if (isLikelyCodeLine(line)) {
        flushMarkdown();
        codeBuffer.push(line);
      } else {
        flushCode();
        markdownBuffer.push(line);
      }
    }

    flushMarkdown();
    flushCode();

    return segments.filter((s) => s.content.length > 0);
  }

  const primaryButtonStyle: React.CSSProperties = {
    background: "#2b3445",
    color: "white",
    border: "1px solid #3b465a",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer"
  };

  const smallButtonStyle: React.CSSProperties = {
    background: "#2b3445",
    color: "white",
    border: "1px solid #3b465a",
    borderRadius: 8,
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: 12
  };

  const dangerButtonStyle: React.CSSProperties = {
    background: "#3a1f1f",
    color: "white",
    border: "1px solid #5a2d2d",
    borderRadius: 8,
    padding: "8px 10px",
    cursor: "pointer",
    fontSize: 12,
    width: "100%",
    marginBottom: 12
  };

  const sidebarStyle: React.CSSProperties = {
    width: isMobile ? 290 : 280,
    background: "#171717",
    borderRight: "1px solid #2f2f2f",
    padding: 12,
    overflowY: "auto",
    flexShrink: 0,
    position: isMobile ? "fixed" : "relative",
    top: 0,
    left: isMobile ? 0 : undefined,
    height: "100vh",
    zIndex: isMobile ? 40 : "auto"
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#212121",
        color: "white",
        fontFamily: "Arial, sans-serif",
        overflow: "hidden"
      }}
    >
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 30
          }}
        />
      )}

      {sidebarOpen && (
        <div style={sidebarStyle}>
          <button
            style={{
              ...primaryButtonStyle,
              width: "100%",
              marginBottom: 14,
              background: "#2a2a2a",
              border: "1px solid #3a3a3a"
            }}
            onClick={newChat}
          >
            + New Chat
          </button>

          <button style={dangerButtonStyle} onClick={clearAllChats}>
            Clear All Chats
          </button>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginBottom: 12,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #3a3a3a",
              background: "#2a2a2a",
              color: "white",
              outline: "none"
            }}
          />

          <a
            href="/settings"
            style={{
              display: "block",
              marginBottom: 14,
              color: "#cbd5e1",
              textDecoration: "none",
              fontSize: 14
            }}
          >
            Settings
          </a>

          <div
            style={{
              fontSize: 13,
              color: "#bdbdbd",
              marginBottom: 10,
              fontWeight: 700
            }}
          >
            Chats
          </div>

          {filteredHistory.length === 0 && (
            <div style={{ color: "#9ca3af", fontSize: 14 }}>
              {search.trim() ? "No matching chats." : "No chats yet."}
            </div>
          )}

          {filteredHistory.map((h) => (
            <div
              key={h.id}
              style={{
                padding: 10,
                marginBottom: 10,
                borderRadius: 10,
                background: activeChatId === h.id ? "#2a2a2a" : "transparent",
                border: "1px solid #2f2f2f"
              }}
            >
              <div
                style={{
                  cursor: "pointer",
                  marginBottom: 8,
                  color: "#f5f5f5",
                  fontWeight: 600,
                  wordBreak: "break-word",
                  fontSize: 14
                }}
                onClick={() => loadChat(h.id)}
              >
                {h.title || "New Chat"}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  style={smallButtonStyle}
                  onClick={() => renameChat(h.id, h.title)}
                >
                  Rename
                </button>
                <button
                  style={smallButtonStyle}
                  onClick={() => deleteChat(h.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          width: "100%"
        }}
      >
        <div
          style={{
            padding: isMobile ? "12px 12px" : "14px 18px",
            borderBottom: "1px solid #2f2f2f",
            background: "#212121",
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center",
            gap: 12,
            flexDirection: isMobile ? "column" : "row"
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              width: isMobile ? "100%" : "auto",
              flexWrap: "wrap"
            }}
          >
            <button
              style={primaryButtonStyle}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
            </button>

            <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700 }}>
              Nexa AI
            </div>

            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{
                background: "#2a2a2a",
                color: "white",
                border: "1px solid #3a3a3a",
                borderRadius: 8,
                padding: "8px 10px"
              }}
            >
              <option value="general">Chat</option>
              <option value="image">Image</option>
            </select>
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              width: isMobile ? "100%" : "auto",
              justifyContent: isMobile ? "flex-start" : "flex-end",
              flexWrap: "wrap"
            }}
          >
            {!userId && (
              <>
                <a href="/login" style={{ color: "#d1d5db", textDecoration: "none" }}>
                  Login
                </a>
                <a href="/signup" style={{ color: "#d1d5db", textDecoration: "none" }}>
                  Sign Up
                </a>
              </>
            )}

            {userId && (
              <>
                <div
                  style={{
                    color: "#d1d5db",
                    fontSize: 14,
                    background: "#2a2a2a",
                    border: "1px solid #3a3a3a",
                    borderRadius: 999,
                    padding: "8px 12px",
                    maxWidth: isMobile ? "100%" : 260,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                  title={userEmail || ""}
                >
                  {userEmail || "Logged in"}
                </div>

                <a
                  href="/settings"
                  style={{ color: "#d1d5db", textDecoration: "none" }}
                >
                  Settings
                </a>

                <button style={primaryButtonStyle} onClick={handleLogout}>
                  Logout
                </button>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isMobile ? "16px 0" : "24px 0"
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                maxWidth: 800,
                margin: isMobile ? "40px auto 0 auto" : "80px auto 0 auto",
                textAlign: "center",
                color: "#cbd5e1",
                padding: "0 20px"
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? 26 : 34,
                  fontWeight: 700,
                  marginBottom: 12
                }}
              >
                How can I help you today?
              </div>
              <div style={{ color: "#9ca3af", fontSize: isMobile ? 15 : 16 }}>
                Ask anything, generate images, or continue an earlier chat.
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 12px" }}>
              {messages.map((m, i) => {
                const isImage =
                  typeof m.content === "string" &&
                  (m.content.startsWith("http") ||
                    m.content.startsWith("data:image"));

                const segments =
                  !isImage && typeof m.content === "string"
                    ? splitContentIntoSegments(m.content)
                    : [];

                const isUser = m.role === "user";

                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: isUser ? "flex-end" : "flex-start",
                      marginBottom: 18
                    }}
                  >
                    <div
                      style={{
                        maxWidth: isMobile ? "92%" : isUser ? "75%" : "85%",
                        background: isUser ? "#2f6fed" : "#2a2a2a",
                        color: "white",
                        borderRadius: 18,
                        padding: isMobile ? "12px 13px" : "14px 16px",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.25)"
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: isUser ? "#dbeafe" : "#f8fafc",
                          marginBottom: 8,
                          fontSize: 13
                        }}
                      >
                        {isUser ? "You" : "AI"}
                      </div>

                      {isImage ? (
                        <div>
                          <img
                            src={m.content}
                            alt="Generated"
                            style={{
                              maxWidth: "360px",
                              width: "100%",
                              borderRadius: 12,
                              display: "block"
                            }}
                          />
                          <button
                            style={{ ...smallButtonStyle, marginTop: 10 }}
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = m.content;
                              a.download = "image.png";
                              a.click();
                            }}
                          >
                            Download
                          </button>
                        </div>
                      ) : (
                        <div style={{ color: "#f3f4f6", lineHeight: 1.65 }}>
                          {segments.map((segment, index) => {
                            if (segment.type === "code") {
                              return (
                                <div
                                  key={index}
                                  style={{
                                    position: "relative",
                                    marginTop: 8,
                                    marginBottom: 8
                                  }}
                                >
                                  <button
                                    onClick={() => copyText(segment.content)}
                                    style={{
                                      position: "absolute",
                                      right: 8,
                                      top: 8,
                                      background: "#334155",
                                      color: "white",
                                      border: "none",
                                      padding: "4px 8px",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                      fontSize: 12
                                    }}
                                  >
                                    Copy
                                  </button>

                                  <pre
                                    style={{
                                      background: "#111827",
                                      padding: 14,
                                      borderRadius: 12,
                                      overflowX: "auto",
                                      border: "1px solid #374151",
                                      margin: 0,
                                      whiteSpace: "pre-wrap"
                                    }}
                                  >
                                    <code>{segment.content}</code>
                                  </pre>
                                </div>
                              );
                            }

                            return (
                              <ReactMarkdown
                                key={index}
                                components={{
                                  p: ({ children }) => (
                                    <div style={{ marginBottom: 10 }}>{children}</div>
                                  ),
                                  ul: ({ children }) => (
                                    <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol style={{ paddingLeft: 20, marginBottom: 10 }}>
                                      {children}
                                    </ol>
                                  ),
                                  li: ({ children }) => (
                                    <li style={{ marginBottom: 4 }}>{children}</li>
                                  ),
                                  h1: ({ children }) => (
                                    <h1 style={{ margin: "12px 0 8px 0", fontSize: 28 }}>
                                      {children}
                                    </h1>
                                  ),
                                  h2: ({ children }) => (
                                    <h2 style={{ margin: "12px 0 8px 0", fontSize: 24 }}>
                                      {children}
                                    </h2>
                                  ),
                                  h3: ({ children }) => (
                                    <h3 style={{ margin: "12px 0 8px 0", fontSize: 20 }}>
                                      {children}
                                    </h3>
                                  ),
                                  code(props: any) {
                                    const { inline, children } = props;
                                    const codeText = String(children).replace(/\n$/, "");

                                    if (inline) {
                                      return (
                                        <code
                                          style={{
                                            background: "#374151",
                                            padding: "2px 6px",
                                            borderRadius: 6
                                          }}
                                        >
                                          {children}
                                        </code>
                                      );
                                    }

                                    return (
                                      <pre
                                        style={{
                                          background: "#111827",
                                          padding: 14,
                                          borderRadius: 12,
                                          overflowX: "auto",
                                          border: "1px solid #374151",
                                          margin: 0
                                        }}
                                      >
                                        <code>{codeText}</code>
                                      </pre>
                                    );
                                  }
                                }}
                              >
                                {segment.content}
                              </ReactMarkdown>
                            );
                          })}

                          {i === messages.length - 1 && loading && !isUser && (
                            <span style={{ marginLeft: 4, opacity: 0.8 }}>▍</span>
                          )}
                        </div>
                      )}

                      {!isUser && !isImage && (
                        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                          <button
                            style={smallButtonStyle}
                            onClick={() => copyText(m.content)}
                          >
                            Copy
                          </button>
                          {i === messages.length - 1 && (
                            <button
                              style={smallButtonStyle}
                              onClick={regenerateLastReply}
                            >
                              Regenerate
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div style={{ color: "#9ca3af", marginTop: 8 }}>Thinking...</div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div
          style={{
            borderTop: "1px solid #2f2f2f",
            background: "#212121",
            padding: isMobile ? "12px" : "16px 20px 20px 20px"
          }}
        >
          <div
            style={{
              maxWidth: 860,
              margin: "0 auto",
              display: "flex",
              gap: 12,
              flexDirection: isMobile ? "column" : "row"
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !loading) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={isMobile ? 2 : 1}
              style={{
                flex: 1,
                padding: 14,
                background: "#2a2a2a",
                color: "white",
                border: "1px solid #3a3a3a",
                borderRadius: 16,
                outline: "none",
                resize: "none",
                minHeight: isMobile ? 74 : 52,
                width: "100%",
                boxSizing: "border-box"
              }}
              placeholder={
                mode === "image"
                  ? "Describe the image you want"
                  : "Message Nexa AI"
              }
            />

            <button
              style={{
                ...primaryButtonStyle,
                width: isMobile ? "100%" : "auto",
                minHeight: 48
              }}
              onClick={() => sendMessage()}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}