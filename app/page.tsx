"use client";

import { useEffect, useRef, useState } from "react";
import { getGuestId } from "@/lib/guest";

type Msg = {
  role: string;
  content: string;
};

type ChatItem = {
  id: string;
  title: string;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [history, setHistory] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("general");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const guestId = typeof window !== "undefined" ? getGuestId() : null;

  async function loadHistory() {
    if (!guestId) return;
    const res = await fetch(`/api/history?guestId=${guestId}`);
    const data = await res.json();
    setHistory(Array.isArray(data) ? data : []);
  }

  async function loadChat(chatId: string) {
    const res = await fetch(`/api/chat-messages?chatId=${chatId}`);
    const data = await res.json();

    if (Array.isArray(data)) {
      setMessages(
        data.map((m: any) => ({
          role: m.role,
          content: m.content
        }))
      );
      setActiveChatId(chatId);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function animateAssistantReply(nextMessages: Msg[], fullReply: string) {
    const words = fullReply.split(" ");
    let current = "";

    setMessages([...nextMessages, { role: "assistant", content: "" }]);

    for (let i = 0; i < words.length; i++) {
      current += (i === 0 ? "" : " ") + words[i];

      setMessages([
        ...nextMessages,
        { role: "assistant", content: current }
      ]);

      await new Promise((resolve) => setTimeout(resolve, 25));
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

    setLoading(true);

    try {
      const endpoint = mode === "image" ? "/api/image" : "/api/chat";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: nextMessages,
          mode,
          guestId,
          chatId: activeChatId
        })
      });

      const data = await res.json();
      const reply = mode === "image" ? data.url : data.reply || data.error || "...";

      if (mode === "image") {
        setMessages([
          ...nextMessages,
          { role: "assistant", content: reply }
        ]);
      } else {
        await animateAssistantReply(nextMessages, reply);
      }

      if (data.chatId && !activeChatId) {
        setActiveChatId(data.chatId);
      }
    } catch {
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "Request failed." }
      ]);
    } finally {
      setLoading(false);
      loadHistory();
    }
  }

  async function regenerateLastReply() {
    const trimmed = [...messages];
    if (!trimmed.length) return;

    if (trimmed[trimmed.length - 1]?.role === "assistant") {
      trimmed.pop();
    }

    await sendMessage(trimmed);
  }

  async function deleteChat(id: string) {
    await fetch(`/api/delete?id=${id}`, { method: "DELETE" });

    if (activeChatId === id) {
      setActiveChatId(null);
      setMessages([]);
    }

    loadHistory();
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
        title: newTitle.trim()
      })
    });

    loadHistory();
  }

  function newChat() {
    setMessages([]);
    setActiveChatId(null);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied");
    } catch {
      alert("Copy failed");
    }
  }

  const primaryButtonStyle: React.CSSProperties = {
    background: "#1e293b",
    color: "white",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "8px 12px",
    cursor: "pointer"
  };

  const smallButtonStyle: React.CSSProperties = {
    background: "#1e293b",
    color: "white",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: 12
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#0f172a",
        color: "white",
        fontFamily: "Arial, sans-serif"
      }}
    >
      {sidebarOpen && (
        <div
          style={{
            width: 300,
            borderRight: "1px solid #1f2937",
            padding: 12,
            background: "#020617",
            overflowY: "auto"
          }}
        >
          <button
            style={{
              ...primaryButtonStyle,
              width: "100%",
              marginBottom: 12
            }}
            onClick={newChat}
          >
            + New Chat
          </button>

          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Chats</h3>

          {history.length === 0 && (
            <div style={{ color: "#cbd5e1", fontSize: 14 }}>No chats yet.</div>
          )}

          {history.map((h) => (
            <div
              key={h.id}
              style={{
                border: "1px solid #334155",
                padding: 10,
                marginBottom: 10,
                borderRadius: 8,
                background: activeChatId === h.id ? "#1e293b" : "#0f172a"
              }}
            >
              <div
                style={{
                  cursor: "pointer",
                  marginBottom: 8,
                  color: "#f8fafc",
                  fontWeight: 600,
                  wordBreak: "break-word"
                }}
                onClick={() => loadChat(h.id)}
              >
                {h.title || "New Chat"}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
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

      <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 20
          }}
        >
          <div>
            <button
              style={{ ...primaryButtonStyle, marginBottom: 12 }}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
            </button>

            <h1 style={{ margin: 0, color: "#f8fafc" }}>Nexa AI</h1>

            <div style={{ marginTop: 12 }}>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                style={{
                  background: "#020617",
                  color: "white",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  padding: "8px 10px"
                }}
              >
                <option value="general">Chat</option>
                <option value="image">Image</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <a href="/login" style={{ color: "#e2e8f0" }}>
              Login
            </a>
            <a href="/signup" style={{ color: "#e2e8f0" }}>
              Sign Up
            </a>
            <button
              style={primaryButtonStyle}
              onClick={async () => {
                await fetch("/api/logout", { method: "POST" });
                window.location.reload();
              }}
            >
              Logout
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 20,
            border: "1px solid #334155",
            borderRadius: 12,
            background: "#020617",
            padding: 16,
            minHeight: 420
          }}
        >
          {messages.length === 0 && (
            <div style={{ color: "#cbd5e1" }}>Start a new chat.</div>
          )}

          {messages.map((m, i) => {
            const isImage =
              typeof m.content === "string" &&
              (m.content.startsWith("http") ||
                m.content.startsWith("data:image"));

            return (
              <div
                key={i}
                style={{
                  marginBottom: 18,
                  paddingBottom: 12,
                  borderBottom:
                    i !== messages.length - 1 ? "1px solid #1e293b" : "none"
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: m.role === "user" ? "#93c5fd" : "#f8fafc",
                    marginBottom: 6
                  }}
                >
                  {m.role === "user" ? "You" : "AI"}
                </div>

                {isImage ? (
                  <div>
                    <img
                      src={m.content}
                      alt="Generated"
                      style={{
                        maxWidth: "320px",
                        width: "100%",
                        borderRadius: 10,
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
                  <div
                    style={{
                      color: "#e5e7eb",
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap"
                    }}
                  >
                    {m.content}
                    {i === messages.length - 1 && loading && (
                      <span style={{ marginLeft: 4 }}>|</span>
                    )}
                  </div>
                )}

                {m.role === "assistant" && !isImage && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
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
            );
          })}

          {loading && <p style={{ color: "#cbd5e1" }}>Thinking...</p>}
          <div ref={bottomRef} />
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !loading) {
                e.preventDefault();
                sendMessage();
              }
            }}
            rows={1}
            style={{
              flex: 1,
              padding: 12,
              background: "#020617",
              color: "white",
              border: "1px solid #334155",
              borderRadius: 10,
              outline: "none",
              resize: "none"
            }}
            placeholder={
              mode === "image"
                ? "Describe the image you want"
                : "Type your message"
            }
          />

          <button style={primaryButtonStyle} onClick={() => sendMessage()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}