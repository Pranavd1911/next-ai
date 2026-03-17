"use client";

import { useState } from "react";
import { getGuestId } from "@/lib/guest";

type Msg = {
  role: string;
  content: string;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [mode, setMode] = useState("general");
  const [usageText, setUsageText] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim()) return;

    const nextMessages = [...messages, { role: "user", content: input }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const guestId = getGuestId();

      const res = await fetch("/api/chat", {
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

      const text = await res.text();
      let data: any = {};

      try {
        data = JSON.parse(text);
      } catch {
        data = { error: `Server returned invalid response: ${text}` };
      }

      if (data.error) {
        setMessages([
          ...nextMessages,
          { role: "assistant", content: data.error }
        ]);
      } else {
        setMessages([
          ...nextMessages,
          { role: "assistant", content: data.reply }
        ]);

        if (data.usage) {
          setUsageText(`${data.usage.usedToday} / ${data.usage.limit} used today`);
        }
      }
    } catch (err) {
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "Request failed." }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1>Nexa AI</h1>

      <div style={{ marginBottom: 12 }}>
        <label>Mode: </label>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="general">General</option>
          <option value="startup">Startup</option>
          <option value="student">Student</option>
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>{usageText}</div>

      <div
        style={{
          border: "1px solid #ccc",
          padding: 16,
          minHeight: 300,
          borderRadius: 8
        }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <strong>{m.role === "user" ? "You" : "Nexa AI"}:</strong> {m.content}
          </div>
        ))}
        {loading && <div>Nexa AI is thinking...</div>}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message"
          style={{ flex: 1, padding: 12 }}
        />
        <button onClick={sendMessage} style={{ padding: "12px 18px" }}>
          Send
        </button>
      </div>
    </main>
  );
}
