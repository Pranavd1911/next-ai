"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getGuestId } from "@/lib/guest";

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

      await new Promise((resolve) => setTimeout(resolve, 18));
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
      const reply =
        mode === "image" ? data.url : data.reply || data.error || "...";

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
      trimmed.startsWith("public ") ||
      trimmed.startsWith("private ") ||
      trimmed.startsWith("console.log(") ||
      trimmed.includes(" = ") ||
      trimmed.includes(" += ") ||
      trimmed.includes(" -= ") ||
      trimmed.includes(" *= ") ||
      trimmed.includes(" /= ") ||
      trimmed.includes("==") ||
      trimmed.includes("!=") ||
      trimmed.includes("=>") ||
      trimmed.includes("();") ||
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

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#212121",
        color: "white",
        fontFamily: "Arial, sans-serif"
      }}
    >
      {sidebarOpen && (
        <div
          style={{
            width: 280,
            background: "#171717",
            borderRight: "1px solid #2f2f2f",
            padding: 12,
            overflowY: "auto",
            flexShrink: 0
          }}
        >
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

          {history.length === 0 && (
            <div style={{ color: "#9ca3af", fontSize: 14 }}>No chats yet.</div>
          )}

          {history.map((h) => (
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

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid #2f2f2f",
            background: "#212121",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              style={primaryButtonStyle}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
            </button>

            <div style={{ fontSize: 20, fontWeight: 700 }}>Nexa AI</div>

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

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <a href="/login" style={{ color: "#d1d5db", textDecoration: "none" }}>
              Login
            </a>
            <a href="/signup" style={{ color: "#d1d5db", textDecoration: "none" }}>
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
            flex: 1,
            overflowY: "auto",
            padding: "24px 0"
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                maxWidth: 800,
                margin: "80px auto 0 auto",
                textAlign: "center",
                color: "#cbd5e1",
                padding: "0 20px"
              }}
            >
              <div style={{ fontSize: 34, fontWeight: 700, marginBottom: 12 }}>
                How can I help you today?
              </div>
              <div style={{ color: "#9ca3af", fontSize: 16 }}>
                Ask anything, generate images, or continue an earlier chat.
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 16px" }}>
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
                      marginBottom: 22
                    }}
                  >
                    <div
                      style={{
                        maxWidth: isUser ? "75%" : "85%",
                        background: isUser ? "#2f6fed" : "#2a2a2a",
                        color: "white",
                        borderRadius: 18,
                        padding: "14px 16px",
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
                            <span style={{ marginLeft: 4 }}>|</span>
                          )}
                        </div>
                      )}

                      {!isUser && !isImage && (
                        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
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
            padding: "16px 20px 20px 20px"
          }}
        >
          <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", gap: 12 }}>
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
                padding: 14,
                background: "#2a2a2a",
                color: "white",
                border: "1px solid #3a3a3a",
                borderRadius: 16,
                outline: "none",
                resize: "none",
                minHeight: 52
              }}
              placeholder={
                mode === "image"
                  ? "Describe the image you want"
                  : "Message Nexa AI"
              }
            />

            <button style={primaryButtonStyle} onClick={() => sendMessage()}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}