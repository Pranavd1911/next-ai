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
      <div className="app-page">
        <div className="shared-wrap">
          <a href="/" className="page-back">
            ← Back to Nexa
          </a>

          <div className="hero-panel">
            <div className="hero-eyebrow">Public Share</div>
            <h1 className="hero-title">Shared chat not found.</h1>
            <p className="hero-copy">{data.error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="shared-wrap">
        <a href="/" className="page-back">
          ← Back to Nexa
        </a>

        <div className="hero-panel">
          <div className="hero-eyebrow">Public Share</div>
          <h1 className="hero-title">{data.chat?.title || "Shared Chat"}</h1>
          <p className="hero-copy">
            A public, read-only snapshot of a Nexa conversation.
          </p>

          <div className="shared-meta">
            <div className="shared-pill">View only</div>
            <div className="shared-pill">Nexa conversation</div>
            {data.chat?.created_at && (
              <div className="shared-pill">
                {new Date(data.chat.created_at).toLocaleDateString()}
              </div>
            )}
          </div>
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
                background:
                  message.role === "user"
                    ? "linear-gradient(135deg, rgba(43,109,196,0.96), rgba(27,80,154,0.98))"
                    : "linear-gradient(180deg, rgba(14,24,41,0.92), rgba(10,17,29,0.96))",
                border: "1px solid rgba(126, 164, 206, 0.14)",
                borderRadius: 20,
                padding: "14px 16px",
                whiteSpace: "pre-wrap",
                lineHeight: 1.7,
                boxShadow: "0 18px 40px rgba(0,0,0,0.2)"
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  opacity: 0.82,
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em"
                }}
              >
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
