import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import { resolveRequestOwnerId, supabaseAdmin } from "@/lib/server-data";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId = null, guestId = null } = body;
    const ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    if (!ownerId) {
      return NextResponse.json(
        { error: "Missing userId or guestId." },
        { status: 400 }
      );
    }

    const { data: chats, error: chatsError } = await supabaseAdmin
      .from("chats")
      .select("id")
      .eq("user_id", ownerId);

    if (chatsError) {
      return NextResponse.json(
        { error: chatsError.message },
        { status: 500 }
      );
    }

    if (!chats || chats.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    const chatIds = chats.map((chat) => chat.id);

    const { error: messagesError } = await supabaseAdmin
      .from("messages")
      .delete()
      .in("chat_id", chatIds);

    if (messagesError) {
      return NextResponse.json(
        { error: messagesError.message },
        { status: 500 }
      );
    }

    const { error: deleteChatsError } = await supabaseAdmin
      .from("chats")
      .delete()
      .eq("user_id", ownerId);

    if (deleteChatsError) {
      return NextResponse.json(
        { error: deleteChatsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted: chatIds.length
    });
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to clear chats.");
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}
