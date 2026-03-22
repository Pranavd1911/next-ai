import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import { supabaseAdmin } from "@/lib/server-data";

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: dailyUsers }, { data: dailyMessages }, { data: events }] = await Promise.all([
      supabaseAdmin
        .from("analytics_events")
        .select("owner_id")
        .gte("created_at", `${today}T00:00:00.000Z`)
        .not("owner_id", "is", null),
      supabaseAdmin
        .from("analytics_events")
        .select("owner_id")
        .eq("event_name", "chat_success")
        .gte("created_at", `${today}T00:00:00.000Z`),
      supabaseAdmin
        .from("analytics_events")
        .select("event_name, metadata, created_at")
        .gte("created_at", `${today}T00:00:00.000Z`)
        .order("created_at", { ascending: false })
        .limit(200)
    ]);

    const uniqueUsers = new Set((dailyUsers || []).map((row) => row.owner_id)).size;
    const messagesPerUser =
      uniqueUsers > 0 ? Math.round((((dailyMessages || []).length / uniqueUsers) * 10)) / 10 : 0;

    const dropOffPoints = (events || [])
      .filter((event) => event.event_name === "chat_error")
      .slice(0, 10)
      .map((event) => ({
        createdAt: event.created_at,
        reason: typeof event.metadata?.reason === "string" ? event.metadata.reason : "Unknown error"
      }));

    return NextResponse.json({
      dailyUsers: uniqueUsers,
      messagesPerUser,
      dropOffPoints
    });
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to load analytics.");
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}
