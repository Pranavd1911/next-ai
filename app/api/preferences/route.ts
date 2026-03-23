import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import {
  deleteMemoryItem,
  getMemoryItems,
  getUserPreferences,
  resolveRequestOwnerId,
  supabaseAdmin,
  syncPreferenceMemory
} from "@/lib/server-data";
import {
  finishRequestTrace,
  startRequestTrace
} from "@/lib/request-tracing";

export async function GET(req: Request) {
  const trace = startRequestTrace("api/preferences:get");
  let ownerId: string | null = null;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const guestId = searchParams.get("guestId");
    ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    const preferences = await getUserPreferences(ownerId);
    const memoryItems = await getMemoryItems(ownerId);
    const response = NextResponse.json({
      ...preferences,
      memoryItems
    });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({ trace, status: 200, ownerId });
    return response;
  } catch (error) {
    const friendly = getFriendlyApiError(
      error,
      "Failed to load preferences."
    );
    const response = NextResponse.json({ error: friendly.message }, { status: friendly.status });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: friendly.status,
      ownerId,
      metadata: { error: error instanceof Error ? error.message : "Unknown preferences get error" }
    });
    return response;
  }
}

export async function POST(req: Request) {
  const trace = startRequestTrace("api/preferences:post");
  let ownerId: string | null = null;

  try {
    const body = await req.json();
    ownerId = await resolveRequestOwnerId(req, {
      userId: body.userId,
      guestId: body.guestId
    });
    const prefersDirectAnswers = body.prefersDirectAnswers !== false;
    const webSearchEnabled = body.webSearchEnabled !== false;
    const codeModeEnabled = body.codeModeEnabled === true;
    const memory =
      typeof body.memory === "string"
        ? body.memory.trim().slice(0, 2000)
        : await syncPreferenceMemory(ownerId);

    await supabaseAdmin.from("user_preferences").upsert({
      owner_id: ownerId,
      memory,
      prefers_direct_answers: prefersDirectAnswers,
      web_search_enabled: webSearchEnabled,
      code_mode_enabled: codeModeEnabled,
      updated_at: new Date().toISOString()
    });

    const preferences = await getUserPreferences(ownerId);
    const memoryItems = await getMemoryItems(ownerId);
    const response = NextResponse.json({
      ...preferences,
      memoryItems
    });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({ trace, status: 200, ownerId });
    return response;
  } catch (error) {
    const friendly = getFriendlyApiError(
      error,
      "Failed to save preferences."
    );
    const response = NextResponse.json({ error: friendly.message }, { status: friendly.status });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: friendly.status,
      ownerId,
      metadata: { error: error instanceof Error ? error.message : "Unknown preferences save error" }
    });
    return response;
  }
}

export async function DELETE(req: Request) {
  const trace = startRequestTrace("api/preferences:delete");
  let ownerId: string | null = null;
  let memoryId: string | null = null;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const guestId = searchParams.get("guestId");
    memoryId = searchParams.get("memoryId");
    ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    if (!memoryId) {
      const response = NextResponse.json({ error: "Memory id is required." }, { status: 400 });
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 400, ownerId });
      return response;
    }

    await deleteMemoryItem(ownerId, memoryId);
    const preferences = await getUserPreferences(ownerId);
    const memoryItems = await getMemoryItems(ownerId);

    const response = NextResponse.json({
      ...preferences,
      memoryItems
    });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({ trace, status: 200, ownerId, metadata: { memoryId } });
    return response;
  } catch (error) {
    const friendly = getFriendlyApiError(
      error,
      "Failed to delete memory."
    );
    const response = NextResponse.json({ error: friendly.message }, { status: friendly.status });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: friendly.status,
      ownerId,
      metadata: {
        memoryId,
        error: error instanceof Error ? error.message : "Unknown memory delete error"
      }
    });
    return response;
  }
}
