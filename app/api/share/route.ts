import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import { resolveRequestOwnerId, supabaseAdmin, trackAnalyticsEvent } from "@/lib/server-data";
import {
  finishRequestTrace,
  startRequestTrace
} from "@/lib/request-tracing";

export async function POST(req: Request) {
  const trace = startRequestTrace("api/share:post");
  let ownerId: string | null = null;
  let chatId: string | null = null;

  try {
    const body = await req.json();
    ownerId = await resolveRequestOwnerId(req, {
      userId: body.userId,
      guestId: body.guestId
    });
    chatId = typeof body.chatId === "string" ? body.chatId : "";

    if (!chatId) {
      const response = NextResponse.json({ error: "Chat id is required." }, { status: 400 });
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
      const response = NextResponse.json({ error: "Chat not found." }, { status: 404 });
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 404, ownerId, chatId });
      return response;
    }

    if (chat.user_id !== ownerId) {
      const response = NextResponse.json({ error: "Unauthorized chat access." }, { status: 403 });
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 403, ownerId, chatId });
      return response;
    }

    const { data: existing } = await supabaseAdmin
      .from("shared_chats")
      .select("id")
      .eq("chat_id", chatId)
      .eq("owner_id", ownerId)
      .maybeSingle();

    const shareId =
      existing?.id ||
      (
        await supabaseAdmin
          .from("shared_chats")
          .insert({
            chat_id: chatId,
            owner_id: ownerId
          })
          .select("id")
          .single()
      ).data?.id;

    if (!shareId) {
      const response = NextResponse.json({ error: "Failed to create share link." }, { status: 500 });
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 500, ownerId, chatId });
      return response;
    }

    await trackAnalyticsEvent({
      ownerId,
      eventName: "share_chat",
      chatId,
      metadata: { shareId }
    });

    const response = NextResponse.json({ shareId, shareUrl: `/share/${shareId}` });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({ trace, status: 200, ownerId, chatId });
    return response;
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to share chat.");
    const response = NextResponse.json({ error: friendly.message }, { status: friendly.status });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: friendly.status,
      ownerId,
      chatId,
      metadata: { error: error instanceof Error ? error.message : "Unknown share error" }
    });
    return response;
  }
}

export async function GET(req: Request) {
  const trace = startRequestTrace("api/share:get");
  let shareId: string | null = null;

  try {
    const { searchParams } = new URL(req.url);
    shareId = searchParams.get("shareId");

    if (!shareId) {
      const response = NextResponse.json({ error: "Share id is required." }, { status: 400 });
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 400, metadata: { shareId } });
      return response;
    }

    const { data: sharedChat, error: shareError } = await supabaseAdmin
      .from("shared_chats")
      .select("id, chat_id")
      .eq("id", shareId)
      .single();

    if (shareError || !sharedChat) {
      const response = NextResponse.json({ error: "Shared chat not found." }, { status: 404 });
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 404, metadata: { shareId } });
      return response;
    }

    const { data: chat } = await supabaseAdmin
      .from("chats")
      .select("id, title, created_at")
      .eq("id", sharedChat.chat_id)
      .single();

    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("role, content, created_at")
      .eq("chat_id", sharedChat.chat_id)
      .order("created_at", { ascending: true });

    const response = NextResponse.json({
      id: sharedChat.id,
      chat,
      messages: messages || []
    });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({ trace, status: 200, metadata: { shareId } });
    return response;
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to load shared chat.");
    const response = NextResponse.json({ error: friendly.message }, { status: friendly.status });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: friendly.status,
      metadata: {
        shareId,
        error: error instanceof Error ? error.message : "Unknown share read error"
      }
    });
    return response;
  }
}
