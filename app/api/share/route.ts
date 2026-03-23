import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import { resolveRequestOwnerId, supabaseAdmin, trackAnalyticsEvent } from "@/lib/server-data";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ownerId = await resolveRequestOwnerId(req, {
      userId: body.userId,
      guestId: body.guestId
    });
    const chatId = typeof body.chatId === "string" ? body.chatId : "";

    if (!chatId) {
      return NextResponse.json({ error: "Chat id is required." }, { status: 400 });
    }

    const { data: chat, error: chatError } = await supabaseAdmin
      .from("chats")
      .select("id, user_id")
      .eq("id", chatId)
      .single();

    if (chatError || !chat) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    if (chat.user_id !== ownerId) {
      return NextResponse.json({ error: "Unauthorized chat access." }, { status: 403 });
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
      return NextResponse.json({ error: "Failed to create share link." }, { status: 500 });
    }

    await trackAnalyticsEvent({
      ownerId,
      eventName: "share_chat",
      chatId,
      metadata: { shareId }
    });

    return NextResponse.json({ shareId, shareUrl: `/share/${shareId}` });
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to share chat.");
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shareId = searchParams.get("shareId");

    if (!shareId) {
      return NextResponse.json({ error: "Share id is required." }, { status: 400 });
    }

    const { data: sharedChat, error: shareError } = await supabaseAdmin
      .from("shared_chats")
      .select("id, chat_id")
      .eq("id", shareId)
      .single();

    if (shareError || !sharedChat) {
      return NextResponse.json({ error: "Shared chat not found." }, { status: 404 });
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

    return NextResponse.json({
      id: sharedChat.id,
      chat,
      messages: messages || []
    });
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to load shared chat.");
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}
