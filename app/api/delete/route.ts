import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import { resolveRequestOwnerId, supabaseAdmin } from "@/lib/server-data";
import {
  finishRequestTrace,
  startRequestTrace
} from "@/lib/request-tracing";

export async function DELETE(req: Request) {
  const trace = startRequestTrace("api/delete");
  let ownerId: string | null = null;
  let id: string | null = null;

  try {
    const { searchParams } = new URL(req.url);
    id = searchParams.get("id");
    const userId = searchParams.get("userId");
    const guestId = searchParams.get("guestId");
    ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    if (!id || !ownerId) {
      const response = NextResponse.json(
        { error: "Missing chat id or owner id." },
        { status: 400 }
      );
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 400, ownerId, chatId: id });
      return response;
    }

    const { data: chat, error: chatError } = await supabaseAdmin
      .from("chats")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (chatError || !chat) {
      const response = NextResponse.json(
        { error: "Chat not found." },
        { status: 404 }
      );
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 404, ownerId, chatId: id });
      return response;
    }

    if (chat.user_id !== ownerId) {
      const response = NextResponse.json(
        { error: "Unauthorized delete request." },
        { status: 403 }
      );
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 403, ownerId, chatId: id });
      return response;
    }

    const { error: messagesError } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("chat_id", id);

    if (messagesError) {
      const response = NextResponse.json(
        { error: messagesError.message },
        { status: 500 }
      );
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({
        trace,
        status: 500,
        ownerId,
        chatId: id,
        metadata: { error: messagesError.message }
      });
      return response;
    }

    const { error: deleteError } = await supabaseAdmin
      .from("chats")
      .delete()
      .eq("id", id)
      .eq("user_id", ownerId);

    if (deleteError) {
      const response = NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({
        trace,
        status: 500,
        ownerId,
        chatId: id,
        metadata: { error: deleteError.message }
      });
      return response;
    }

    const response = NextResponse.json({ success: true });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({ trace, status: 200, ownerId, chatId: id });
    return response;
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to delete chat.");
    const response = NextResponse.json({ error: friendly.message }, { status: friendly.status });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: friendly.status,
      ownerId,
      chatId: id,
      metadata: { error: error instanceof Error ? error.message : "Unknown delete error" }
    });
    return response;
  }
}
