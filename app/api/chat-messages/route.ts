import { NextResponse } from "next/server";
import { processQueuedExtractionJobs } from "@/lib/file-extraction-jobs";
import { getFriendlyApiError } from "@/lib/api-guards";
import { resolveRequestOwnerId, supabaseAdmin } from "@/lib/server-data";
import {
  finishRequestTrace,
  startRequestTrace
} from "@/lib/request-tracing";

export async function GET(req: Request) {
  const trace = startRequestTrace("api/chat-messages");
  let ownerId: string | null = null;
  let chatId: string | null = null;

  try {
    const { searchParams } = new URL(req.url);
    chatId = searchParams.get("chatId");
    const userId = searchParams.get("userId");
    const guestId = searchParams.get("guestId");
    ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    if (!chatId || !ownerId) {
      const response = NextResponse.json(
        { error: "Missing chatId or owner id." },
        { status: 400 }
      );
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 400, ownerId, chatId });
      return response;
    }

    const { data: chat, error: chatError } = await supabaseAdmin
      .from("chats")
      .select("id, user_id")
      .eq("id", chatId)
      .single();

    if (chatError || !chat) {
      const response = NextResponse.json(
        { error: "Chat not found." },
        { status: 404 }
      );
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 404, ownerId, chatId });
      return response;
    }

    if (chat.user_id !== ownerId) {
      const response = NextResponse.json(
        { error: "Unauthorized chat access." },
        { status: 403 }
      );
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 403, ownerId, chatId });
      return response;
    }

    try {
      await processQueuedExtractionJobs({
        ownerId,
        chatId,
        limit: 1
      });
    } catch (processingError) {
      console.error("Queued extraction processing failed during chat load:", processingError);
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("role, content, metadata, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

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
        chatId,
        metadata: { error: error.message }
      });
      return response;
    }

    const response = NextResponse.json(data || []);
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({ trace, status: 200, ownerId, chatId });
    return response;
  } catch (error) {
    console.error("GET /api/chat-messages failed:", error);
    const friendly = getFriendlyApiError(error, "Failed to load messages.");
    const response = NextResponse.json(
      { error: friendly.message },
      { status: friendly.status }
    );
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: friendly.status,
      ownerId,
      chatId,
      metadata: {
        error:
          error instanceof Error ? error.message : "Unknown chat-messages error"
      }
    });
    return response;
  }
}
