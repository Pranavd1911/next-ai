export type OperationalSeverity = "info" | "warn" | "error" | "critical";

export function classifyTraceSeverity(status: number, durationMs: number): OperationalSeverity {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  if (durationMs >= 5000) return "warn";
  return "info";
}

export async function recordOperationalEvent(params: {
  severity: OperationalSeverity;
  source: string;
  message: string;
  ownerId?: string | null;
  chatId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const payload = {
    severity: params.severity,
    source: params.source,
    message: params.message.slice(0, 500),
    owner_id: params.ownerId || null,
    chat_id: params.chatId || null,
    request_id: params.requestId || null,
    metadata: params.metadata || {}
  };

  try {
    const { supabaseAdmin } = await import("./server-data.ts");
    await supabaseAdmin.from("observability_events").insert(payload);
  } catch (error) {
    console.error("Operational event persistence failed:", error);
  }

  const webhookUrl = process.env.OBSERVABILITY_WEBHOOK_URL;
  if (!webhookUrl) return;
  if (params.severity !== "error" && params.severity !== "critical") return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...payload,
        created_at: new Date().toISOString()
      })
    });
  } catch (error) {
    console.error("Operational webhook delivery failed:", error);
  }
}
