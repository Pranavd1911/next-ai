type SharedChatData = {
  chat?: {
    title?: string;
    created_at?: string;
  };
  messages?: Array<{
    role: string;
    content: string;
  }>;
  error?: string;
};

export const dynamic = "force-dynamic";

async function getSharedChat(shareId: string): Promise<SharedChatData> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/share?shareId=${shareId}`, {
    cache: "no-store"
  });

  return res.json();
}

export default async function SharedChatPage({
  params
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const data = await getSharedChat(shareId);

  if (data.error) {
    return (
      <div style={{ minHeight: "100vh", background: "#121212", color: "white", padding: 24 }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <a href="/" style={{ color: "#cbd5e1", textDecoration: "none" }}>
            ← Back to Nexa
          </a>
          <h1>Shared chat not found</h1>
          <div style={{ color: "#94a3b8" }}>{data.error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#121212", color: "white", padding: 24 }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <a href="/" style={{ color: "#cbd5e1", textDecoration: "none" }}>
          ← Back to Nexa
        </a>
        <h1 style={{ marginBottom: 6 }}>{data.chat?.title || "Shared Chat"}</h1>
        <div style={{ color: "#94a3b8", marginBottom: 24 }}>
          Public share view
        </div>

        {(data.messages || []).map((message, index) => (
          <div
            key={index}
            style={{
              marginBottom: 14,
              display: "flex",
              justifyContent: message.role === "user" ? "flex-end" : "flex-start"
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                background: message.role === "user" ? "#2f6fed" : "#1f1f1f",
                border: "1px solid #333",
                borderRadius: 16,
                padding: "12px 14px",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                {message.role === "user" ? "You" : "Nexa"}
              </div>
              {message.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
