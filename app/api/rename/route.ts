import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import { resolveRequestOwnerId, supabaseAdmin } from "@/lib/server-data";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, title, userId = null, guestId = null } = body;
    const ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    if (!id || !title || !ownerId) {
      return NextResponse.json(
        { error: "Missing id, title, or owner id." },
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
        { error: "Unauthorized rename request." },
        { status: 403 }
      );
    }

    const { error } = await supabaseAdmin
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
    const friendly = getFriendlyApiError(error, "Failed to rename chat.");
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}
