import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import { resolveRequestOwnerId, supabaseAdmin } from "@/lib/server-data";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get("chatId");
    const userId = searchParams.get("userId");
    const guestId = searchParams.get("guestId");
    const ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    if (!chatId || !ownerId) {
      return NextResponse.json(
        { error: "Missing chatId or owner id." },
        { status: 400 }
      );
    }

    const { data: chat, error: chatError } = await supabaseAdmin
      .from("chats")
      .select("id, user_id")
      .eq("id", chatId)
      .single();

    if (chatError || !chat) {
      return NextResponse.json(
        { error: "Chat not found." },
        { status: 404 }
      );
    }

    if (chat.user_id !== ownerId) {
      return NextResponse.json(
        { error: "Unauthorized chat access." },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("role, content, metadata, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to load messages.");
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}
