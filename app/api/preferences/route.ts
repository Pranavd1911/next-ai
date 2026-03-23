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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const guestId = searchParams.get("guestId");
    const ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    const preferences = await getUserPreferences(ownerId);
    const memoryItems = await getMemoryItems(ownerId);
    return NextResponse.json({
      ...preferences,
      memoryItems
    });
  } catch (error) {
    const friendly = getFriendlyApiError(
      error,
      "Failed to load preferences."
    );
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ownerId = await resolveRequestOwnerId(req, {
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
    return NextResponse.json({
      ...preferences,
      memoryItems
    });
  } catch (error) {
    const friendly = getFriendlyApiError(
      error,
      "Failed to save preferences."
    );
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const guestId = searchParams.get("guestId");
    const memoryId = searchParams.get("memoryId");
    const ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    if (!memoryId) {
      return NextResponse.json({ error: "Memory id is required." }, { status: 400 });
    }

    await deleteMemoryItem(ownerId, memoryId);
    const preferences = await getUserPreferences(ownerId);
    const memoryItems = await getMemoryItems(ownerId);

    return NextResponse.json({
      ...preferences,
      memoryItems
    });
  } catch (error) {
    const friendly = getFriendlyApiError(
      error,
      "Failed to delete memory."
    );
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}
