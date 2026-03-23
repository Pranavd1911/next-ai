import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import { resolveRequestOwnerId, supabaseAdmin } from "@/lib/server-data";

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("userId");
    const guestId = searchParams.get("guestId");
    const ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    if (!id || !ownerId) {
      return NextResponse.json(
        { error: "Missing chat id or owner id." },
        { status: 400 }
      );
    }

    const { data: chat, error: chatError } = await supabaseAdmin
      .from("chats")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (chatError || !chat) {
      return NextResponse.json(
        { error: "Chat not found." },
        { status: 404 }
      );
    }

    if (chat.user_id !== ownerId) {
      return NextResponse.json(
        { error: "Unauthorized delete request." },
        { status: 403 }
      );
    }

    const { error: messagesError } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("chat_id", id);

    if (messagesError) {
      return NextResponse.json(
        { error: messagesError.message },
        { status: 500 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("chats")
      .delete()
      .eq("id", id)
      .eq("user_id", ownerId);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to delete chat.");
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}
