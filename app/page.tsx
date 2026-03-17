"use client";

import { useEffect, useState } from "react";
import { getGuestId } from "@/lib/guest";

type Msg = {
  role: string;
  content: string;
};

type HistoryItem = {
  id: string;
  content: string;
  role: string;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("general");

  async function loadHistory() {
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function sendMessage() {
    if (!input.trim()) return;

    const nextMessages = [...messages, { role: "user", content: input }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const guestId = getGuestId();
      const endpoint = mode === "image" ? "/api/image" : "/api/chat";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: nextMessages,
          mode,
          guestId
        })
      });

      const data = await res.json();
      const reply = mode === "image" ? data.url : data.reply;

      setMessages([
        ...nextMessages,
        { role: "assistant", content: reply || data.error || "..." }
      ]);
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

  async function deleteHistoryItem(id: string) {
    await fetch(`/api/delete?id=${id}`, {
      method: "DELETE"
    });
    loadHistory();
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div
        style={{
          width: 280,
          borderRight: "1px solid #ddd",
          padding: 12,
          overflowY: "auto"
        }}
      >
        <button
          style={{
            width: "100%",
            marginBottom: 12,
            padding: 10,
            borderRadius: 8
          }}
          onClick={() => setMessages([])}
        >
          + New Chat
        </button>

        <h3 style={{ marginTop: 0 }}>History</h3>

        {history.length === 0 && (
          <div style={{ fontSize: 13, color: "#666" }}>No history yet.</div>
        )}

        {history.map((h) => (
          <div
            key={h.id}
            style={{
              border: "1px solid #ddd",
              padding: 8,
              marginBottom: 8,
              borderRadius: 8
            }}
          >
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <strong>{h.role}:</strong> {h.content?.slice(0, 60) || "..."}
            </div>

            <button
              style={{ fontSize: 11, padding: "4px 8px" }}
              onClick={() => deleteHistoryItem(h.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>

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
            <h1 style={{ margin: 0 }}>Nexa AI</h1>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{ marginTop: 10 }}
            >
              <option value="general">Chat</option>
              <option value="image">Image</option>
            </select>
          </div>

          <div>
            <a href="/login" style={{ marginRight: 12 }}>
              Login
            </a>
            <a href="/signup">Sign Up</a>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #ccc",
            padding: 16,
            minHeight: 420,
            borderRadius: 8,
            marginBottom: 12
          }}
        >
          {messages.length === 0 && (
            <div style={{ color: "#666" }}>Start a new chat.</div>
          )}

          {messages.map((m, i) => {
            const content = typeof m.content === "string" ? m.content : "";
            const isImage =
              content.startsWith("http") || content.startsWith("data:image");

            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <strong>{m.role === "user" ? "You" : "Nexa AI"}:</strong>

                <div style={{ marginTop: 5 }}>
                  {isImage ? (
                    <div>
                      <img
                        src={content}
                        alt="Generated"
                        style={{ maxWidth: "100%", borderRadius: 8 }}
                      />
                      <button
                        style={{
                          marginTop: 8,
                          padding: "6px 10px",
                          fontSize: 12,
                          borderRadius: 6,
                          cursor: "pointer"
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
                  ) : (
                    content
                  )}
                </div>
              </div>
            );
          })}

          {loading && <div>Thinking...</div>}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid #ccc" }}
            placeholder={mode === "image" ? "Describe the image you want" : "Type your message"}
          />
          <button onClick={sendMessage} style={{ padding: "12px 18px", borderRadius: 8 }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
