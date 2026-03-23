import { NextResponse } from "next/server";
import { getFriendlyApiError } from "@/lib/api-guards";
import { resolveRequestOwnerId, supabaseAdmin } from "@/lib/server-data";

export async function GET(req: Request) {
  try {
    const ownerId = await resolveRequestOwnerId(req, {
      userId: new URL(req.url).searchParams.get("userId"),
      guestId: null
    });
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const [{ data: dailyUsers }, { data: dailyMessages }, { data: events }, { data: sevenDayEvents }] = await Promise.all([
      supabaseAdmin
        .from("analytics_events")
        .select("owner_id")
        .gte("created_at", `${today}T00:00:00.000Z`)
        .eq("owner_id", ownerId)
        .not("owner_id", "is", null),
      supabaseAdmin
        .from("analytics_events")
        .select("owner_id")
        .eq("event_name", "chat_success")
        .gte("created_at", `${today}T00:00:00.000Z`)
        .eq("owner_id", ownerId),
      supabaseAdmin
        .from("analytics_events")
        .select("event_name, metadata, created_at")
        .gte("created_at", `${today}T00:00:00.000Z`)
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("analytics_events")
        .select("event_name, owner_id, created_at")
        .gte("created_at", `${sevenDaysAgo}T00:00:00.000Z`)
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true })
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

    const seriesMap = new Map<string, { date: string; users: Set<string>; messages: number }>();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      seriesMap.set(date, { date, users: new Set<string>(), messages: 0 });
    }

    for (const event of sevenDayEvents || []) {
      const date = String(event.created_at).slice(0, 10);
      const bucket = seriesMap.get(date);
      if (!bucket) continue;
      if (event.owner_id) bucket.users.add(event.owner_id);
      if (event.event_name === "chat_success") bucket.messages += 1;
    }

    const dailySeries = Array.from(seriesMap.values()).map((bucket) => ({
      date: bucket.date,
      users: bucket.users.size,
      messages: bucket.messages
    }));

    return NextResponse.json({
      dailyUsers: uniqueUsers,
      messagesPerUser,
      dropOffPoints,
      dailySeries
    });
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to load analytics.");
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}
