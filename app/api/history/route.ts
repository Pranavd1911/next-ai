import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import { resolveRequestOwnerId, supabaseAdmin } from "@/lib/server-data";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const guestId = searchParams.get("guestId");
    if (!userId && !guestId) {
      return NextResponse.json([]);
    }
    const ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    const { data, error } = await supabaseAdmin
      .from("chats")
      .select("id, title, created_at")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to load history.");
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}
