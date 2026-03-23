import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import { resolveRequestOwnerId, supabaseAdmin } from "@/lib/server-data";
import {
  finishRequestTrace,
  startRequestTrace
} from "@/lib/request-tracing";

export async function GET(req: Request) {
  const trace = startRequestTrace("api/history");
  let ownerId: string | null = null;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const guestId = searchParams.get("guestId");
    if (!userId && !guestId) {
      const response = NextResponse.json([]);
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 200 });
      return response;
    }
    ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    const { data, error } = await supabaseAdmin
      .from("chats")
      .select("id, title, created_at")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false });

    if (error) {
      const response = NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({
        trace,
        status: 500,
        ownerId,
        metadata: { error: error.message }
      });
      return response;
    }

    const response = NextResponse.json(data || []);
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({ trace, status: 200, ownerId });
    return response;
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to load history.");
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
        error: error instanceof Error ? error.message : "Unknown history error"
      }
    });
    return response;
  }
}
