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
        fontFamily: "Arial"
      }}
    >
      {sidebarOpen && (
        <div
          style={{
            width: 300,
            borderRight: "1px solid #1f2937",
            padding: 12,
            background: "#020617"
          }}
        >
          <button
            style={{
              width: "100%",
              marginBottom: 12,
              padding: 10,
              borderRadius: 8,
              background: "#1e293b",
              color: "white"
            }}
            onClick={newChat}
          >
            + New Chat
          </button>

          <h3>Chats</h3>

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
                style={{ cursor: "pointer", marginBottom: 6 }}
                onClick={() => loadChat(h.id)}
              >
                {h.title}
              </div>

              <button onClick={() => renameChat(h.id, h.title)}>Rename</button>
              <button onClick={() => deleteChat(h.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, padding: 20 }}>
        <button onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
        </button>

        <h1>Nexa AI</h1>

        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="general">Chat</option>
          <option value="image">Image</option>
        </select>

        <div style={{ marginTop: 20 }}>
          {messages.map((m, i) => (
            <div key={i}>
              <b>{m.role === "user" ? "You" : "AI"}:</b>

              {m.content.startsWith("http") ? (
                <div>
                  <img src={m.content} style={{ maxWidth: "300px" }} />
                  <button
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
                <div>{m.content}</div>
              )}

              {m.role === "assistant" && (
                <>
                  <button onClick={() => copyText(m.content)}>Copy</button>
                  {i === messages.length - 1 && (
                    <button onClick={regenerateLastReply}>
                      Regenerate
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {loading && <p>Thinking...</p>}

        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) {
                e.preventDefault();
                sendMessage();
              }
            }}
            style={{
              flex: 1,
              padding: 10,
              background: "#020617",
              color: "white"
            }}
          />

          <button onClick={() => sendMessage()}>Send</button>
        </div>
      </div>
    </div>
  );
}
