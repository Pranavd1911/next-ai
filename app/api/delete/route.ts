import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("userId");
    const guestId = searchParams.get("guestId");

    const ownerId = userId || guestId;

    if (!id || !ownerId) {
      return NextResponse.json(
        { error: "Missing chat id or owner id." },
        { status: 400 }
      );
    }

    const { data: chat, error: chatError } = await supabase
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

    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .eq("chat_id", id);

    if (messagesError) {
      return NextResponse.json(
        { error: messagesError.message },
        { status: 500 }
      );
    }

    const { error: deleteError } = await supabase
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
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete chat."
      },
      { status: 500 }
    );
  }
}