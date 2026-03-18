import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { guestId, userId } = body;

    if (!guestId || !userId) {
      return NextResponse.json(
        { error: "Missing guestId or userId." },
        { status: 400 }
      );
    }

    if (guestId === userId) {
      return NextResponse.json({ success: true, moved: 0 });
    }

    const { data: guestChats, error: fetchError } = await supabase
      .from("chats")
      .select("id")
      .eq("user_id", guestId);

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    if (!guestChats || guestChats.length === 0) {
      return NextResponse.json({ success: true, moved: 0 });
    }

    const { error: updateError } = await supabase
      .from("chats")
      .update({ user_id: userId })
      .eq("user_id", guestId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      moved: guestChats.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to migrate guest chats."
      },
      { status: 500 }
    );
  }
}
