"use client";

import { useEffect, useState } from "react";
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
      const reply = mode === "image" ? data.url : data.reply;

      setMessages([
        ...nextMessages,
        { role: "assistant", content: reply || data.error || "..." }
      ]);

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
            overflowY: "auto",
            background: "#020617",
            color: "white"
          }}
        >
          <button
            style={{
              width: "100%",
              marginBottom: 12,
              padding: 10,
              borderRadius: 8,
              background: "#1e293b",
              color: "white",
              border: "1px solid #334155"
            }}
            onClick={newChat}
          >
            + New Chat
          </button>

          <h3 style={{ marginTop: 0 }}>Chats</h3>

          {history.length === 0 && (
            <div style={{ fontSize: 13, color: "#9ca3af" }}>No chats yet.</div>
          )}

          {history.map((h) => (
            <div
              key={h.id}
              style={{
                border: "1px solid #334155",
                padding: 8,
                marginBottom: 8,
                borderRadius: 8,
                background: activeChatId === h.id ? "#1e293b" : "#0f172a"
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  marginBottom: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  color: "white"
                }}
                onClick={() => loadChat(h.id)}
              >
                {h.title || "New Chat"}
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <button
                  style={{
                    fontSize: 11,
                    padding: "4px 8px",
                    background: "#1e293b",
                    color: "white",
                    border: "1px solid #334155",
                    borderRadius: 6
                  }}
                  onClick={() => renameChat(h.id, h.title)}
                >
                  Rename
                </button>

                <button
                  style={{
                    fontSize: 11,
                    padding: "4px 8px",
                    background: "#1e293b",
                    color: "white",
                    border: "1px solid #334155",
                    borderRadius: 6
                  }}
                  onClick={() => deleteChat(h.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16
          }}
        >
          <div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                marginRight: 12,
                background: "#1e293b",
                color: "white",
                border: "1px solid #334155",
                borderRadius: 6,
                padding: "6px 10px"
              }}
            >
              {sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
            </button>

            <h1 style={{ margin: "10px 0 0 0", color: "white" }}>Nexa AI</h1>

            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{
                marginTop: 10,
                background: "#020617",
                color: "white",
                border: "1px solid #334155",
                padding: 8,
                borderRadius: 6
              }}
            >
              <option value="general">Chat</option>
              <option value="image">Image</option>
            </select>
          </div>

          <div>
            <a href="/login" style={{ marginRight: 12, color: "white" }}>
              Login
            </a>
            <a href="/signup" style={{ marginRight: 12, color: "white" }}>
              Sign Up
            </a>
            <button
              onClick={async () => {
                await fetch("/api/logout", { method: "POST" });
                window.location.reload();
              }}
              style={{
                background: "#1e293b",
                color: "white",
                border: "1px solid #334155",
                borderRadius: 6,
                padding: "6px 10px"
              }}
            >
              Logout
            </button>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #1f2937",
            padding: 16,
            minHeight: 420,
            borderRadius: 8,
            marginBottom: 12,
            background: "#020617",
            color: "white"
          }}
        >
          {messages.length === 0 && (
            <div style={{ color: "#9ca3af" }}>Start a new chat.</div>
          )}

          {messages.map((m, i) => {
            const content = typeof m.content === "string" ? m.content : "";
            const isImage =
              content.startsWith("http") || content.startsWith("data:image");

            return (
              <div key={i} style={{ marginBottom: 16 }}>
                <strong>{m.role === "user" ? "You" : "Nexa AI"}:</strong>

                <div style={{ marginTop: 6 }}>
                  {isImage ? (
                    <div>
                      <img
                        src={content}
                        alt="Generated"
                        style={{ maxWidth: "100%", borderRadius: 8 }}
                      />
                      <div style={{ marginTop: 8 }}>
                        <button
                          style={{
                            padding: "6px 10px",
                            fontSize: 12,
                            borderRadius: 6,
                            cursor: "pointer",
                            background: "#1e293b",
                            color: "white",
                            border: "1px solid #334155"
                          }}
                          onClick={() => {
                            const link = document.createElement("a");
                            link.href = content;
                            link.download = "nexa-image.png";
                            link.click();
                          }}
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ color: "white" }}>{content}</div>

                      {m.role === "assistant" && (
                        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                          <button
                            style={{
                              fontSize: 12,
                              padding: "4px 8px",
                              background: "#1e293b",
                              color: "white",
                              border: "1px solid #334155",
                              borderRadius: 6
                            }}
                            onClick={() => copyText(content)}
                          >
                            Copy
                          </button>

                          {i === messages.length - 1 && (
                            <button
                              style={{
                                fontSize: 12,
                                padding: "4px 8px",
                                background: "#1e293b",
                                color: "white",
                                border: "1px solid #334155",
                                borderRadius: 6
                              }}
                              onClick={regenerateLastReply}
                            >
                              Regenerate
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && <div style={{ color: "#9ca3af" }}>Thinking...</div>}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 8,
              border: "1px solid #1f2937",
              background: "#020617",
              color: "white"
            }}
            placeholder={
              mode === "image"
                ? "Describe the image you want"
                : "Type your message"
            }
          />
          <button
            onClick={() => sendMessage()}
            style={{
              padding: "12px 18px",
              borderRadius: 8,
              background: "#1e293b",
              color: "white",
              border: "1px solid #334155"
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}