import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { id, title } = await req.json();

    if (!id || !title) {
      return NextResponse.json(
        { error: "Missing id or title" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("chats")
      .update({ title })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Rename failed" },
      { status: 500 }
    );
  }
}
