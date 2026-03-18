import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId = null, guestId = null } = body;

    const ownerId = userId || guestId;

    if (!ownerId) {
      return NextResponse.json(
        { error: "Missing userId or guestId." },
        { status: 400 }
      );
    }

    const { data: chats, error: chatsError } = await supabase
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

    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .in("chat_id", chatIds);

    if (messagesError) {
      return NextResponse.json(
        { error: messagesError.message },
        { status: 500 }
      );
    }

    const { error: deleteChatsError } = await supabase
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
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to clear chats."
      },
      { status: 500 }
    );
  }
}