import { randomUUID } from "node:crypto";
import {
  classifyTraceSeverity,
  recordOperationalEvent
} from "./observability.ts";

export type RequestTrace = {
  route: string;
  requestId: string;
  startedAt: number;
};

export function startRequestTrace(route: string): RequestTrace {
  return {
    route,
    requestId: randomUUID(),
    startedAt: Date.now()
  };
}

export function traceHeaders(
  trace: RequestTrace,
  init?: HeadersInit
) {
  const headers = new Headers(init);
  headers.set("X-Request-Id", trace.requestId);
  return headers;
}

export async function finishRequestTrace(params: {
  trace: RequestTrace;
  status: number;
  ownerId?: string | null;
  chatId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const durationMs = Date.now() - params.trace.startedAt;
  const baseMetadata = {
    route: params.trace.route,
    requestId: params.trace.requestId,
    durationMs,
    ...params.metadata
  };
  const severity = classifyTraceSeverity(params.status, durationMs);

  if (params.status >= 500 || durationMs >= 1500) {
    const { trackAnalyticsEvent } = await import("./server-data.ts");
    await trackAnalyticsEvent({
      ownerId: params.ownerId || null,
      chatId: params.chatId || null,
      eventName: "server_request_trace",
      metadata: {
        ...baseMetadata,
        status: params.status
      }
    });
  }

  if (severity !== "info") {
    await recordOperationalEvent({
      severity,
      source: params.trace.route,
      message: `Request completed with status ${params.status} in ${durationMs}ms`,
      ownerId: params.ownerId || null,
      chatId: params.chatId || null,
      requestId: params.trace.requestId,
      metadata: {
        status: params.status,
        durationMs,
        ...params.metadata
      }
    });
  }

  const logger = params.status >= 500 ? console.error : console.info;
  logger(
    `[trace] ${params.trace.route} ${params.status} ${durationMs}ms ${params.trace.requestId}`
  );
}
