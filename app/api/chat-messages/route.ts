import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get("chatId");
    const userId = searchParams.get("userId");
    const guestId = searchParams.get("guestId");

    const ownerId = userId || guestId;

    if (!chatId || !ownerId) {
      return NextResponse.json(
        { error: "Missing chatId or owner id." },
        { status: 400 }
      );
    }

    const { data: chat, error: chatError } = await supabase
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

    const { data, error } = await supabase
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
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load messages."
      },
      { status: 500 }
    );
  }
}
