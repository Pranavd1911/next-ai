import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import {
  enforceDistributedRateLimit,
  resolveRequestOwnerId,
  trackAnalyticsEvent
} from "@/lib/server-data";
import {
  finishRequestTrace,
  startRequestTrace
} from "@/lib/request-tracing";

export async function POST(req: Request) {
  const trace = startRequestTrace("api/client-errors");
  let ownerId: string | null = null;

  try {
    const body = await req.json();
    ownerId = await resolveRequestOwnerId(req, {
      userId: body?.userId || null,
      guestId: body?.guestId || null
    });

    await enforceDistributedRateLimit({
      ownerId,
      route: "client-errors",
      limit: 15,
      windowSeconds: 60
    });

    await trackAnalyticsEvent({
      ownerId,
      eventName: "client_error",
      metadata: {
        source: typeof body?.source === "string" ? body.source : "ui",
        message: typeof body?.message === "string" ? body.message.slice(0, 500) : "",
        stack: typeof body?.stack === "string" ? body.stack.slice(0, 3000) : "",
        href: typeof body?.href === "string" ? body.href : "",
        requestId: typeof body?.requestId === "string" ? body.requestId : ""
      }
    });

    const response = NextResponse.json({ ok: true });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({ trace, status: 200, ownerId });
    return response;
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to record client error.");
    const response = NextResponse.json(
      { error: friendly.message },
      { status: friendly.status }
    );
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: friendly.status,
      ownerId,
      metadata: {
        error:
          error instanceof Error ? error.message : "Unknown client-error route failure"
      }
    });
    return response;
  }
}
