import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, title, userId = null, guestId = null } = body;

    const ownerId = userId || guestId;

    if (!id || !title || !ownerId) {
      return NextResponse.json(
        { error: "Missing id, title, or owner id." },
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
        { error: "Unauthorized rename request." },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from("chats")
      .update({ title: String(title).slice(0, 100) })
      .eq("id", id)
      .eq("user_id", ownerId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to rename chat."
      },
      { status: 500 }
    );
  }
}