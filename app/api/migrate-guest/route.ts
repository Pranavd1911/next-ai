import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getFriendlyApiError } from "@/lib/api-guards";
import {
  requireAuthenticatedUserId,
  resolveRequestOwnerId
} from "@/lib/server-data";
import { mergeRememberedMemory } from "@/lib/user-memory";

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

    const authenticatedUserId = await requireAuthenticatedUserId(req, userId);
    const resolvedGuestId = await resolveRequestOwnerId(req, { guestId });

    if (authenticatedUserId !== userId) {
      return NextResponse.json(
        { error: "Authenticated user mismatch." },
        { status: 403 }
      );
    }

    if (resolvedGuestId !== guestId) {
      return NextResponse.json(
        { error: "Guest session mismatch." },
        { status: 403 }
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
      const { data: guestPreferences } = await supabase
        .from("user_preferences")
        .select("memory, prefers_direct_answers, web_search_enabled, code_mode_enabled")
        .eq("owner_id", guestId)
        .maybeSingle();

      if (guestPreferences) {
        const { data: userPreferences } = await supabase
          .from("user_preferences")
          .select("memory, prefers_direct_answers, web_search_enabled, code_mode_enabled")
          .eq("owner_id", userId)
          .maybeSingle();

        await supabase.from("user_preferences").upsert({
          owner_id: userId,
          memory: mergeRememberedMemory(
            userPreferences?.memory || "",
            guestPreferences.memory || ""
          ),
          prefers_direct_answers:
            userPreferences?.prefers_direct_answers ?? guestPreferences.prefers_direct_answers ?? true,
          web_search_enabled:
            userPreferences?.web_search_enabled ?? guestPreferences.web_search_enabled ?? true,
          code_mode_enabled:
            userPreferences?.code_mode_enabled ?? guestPreferences.code_mode_enabled ?? false,
          updated_at: new Date().toISOString()
        });

        await supabase.from("user_preferences").delete().eq("owner_id", guestId);
      }

      await supabase.from("memory_items").update({ owner_id: userId }).eq("owner_id", guestId);
      await supabase.from("shared_chats").update({ owner_id: userId }).eq("owner_id", guestId);
      await supabase.from("analytics_events").update({ owner_id: userId }).eq("owner_id", guestId);
      await supabase.from("observability_events").update({ owner_id: userId }).eq("owner_id", guestId);

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

    await supabase.from("shared_chats").update({ owner_id: userId }).eq("owner_id", guestId);
    await supabase.from("memory_items").update({ owner_id: userId }).eq("owner_id", guestId);
    await supabase.from("analytics_events").update({ owner_id: userId }).eq("owner_id", guestId);
    await supabase.from("observability_events").update({ owner_id: userId }).eq("owner_id", guestId);

    const { data: guestCounts } = await supabase
      .from("usage_counts")
      .select("chat_count, image_count")
      .eq("owner_id", guestId)
      .maybeSingle();
    const { data: userCounts } = await supabase
      .from("usage_counts")
      .select("chat_count, image_count")
      .eq("owner_id", userId)
      .maybeSingle();

    if (guestCounts) {
      await supabase.from("usage_counts").upsert({
        owner_id: userId,
        chat_count: (userCounts?.chat_count || 0) + (guestCounts.chat_count || 0),
        image_count: (userCounts?.image_count || 0) + (guestCounts.image_count || 0),
        updated_at: new Date().toISOString()
      });
      await supabase.from("usage_counts").delete().eq("owner_id", guestId);
    }

    const { data: guestDailyRows } = await supabase
      .from("usage_daily")
      .select("usage_date, chat_count, image_count")
      .eq("owner_id", guestId);

    for (const row of guestDailyRows || []) {
      const { data: existing } = await supabase
        .from("usage_daily")
        .select("chat_count, image_count")
        .eq("owner_id", userId)
        .eq("usage_date", row.usage_date)
        .maybeSingle();

      await supabase.from("usage_daily").upsert({
        owner_id: userId,
        usage_date: row.usage_date,
        chat_count: (existing?.chat_count || 0) + (row.chat_count || 0),
        image_count: (existing?.image_count || 0) + (row.image_count || 0)
      });
    }

    if (guestDailyRows?.length) {
      await supabase.from("usage_daily").delete().eq("owner_id", guestId);
    }

    const { data: guestPreferences } = await supabase
      .from("user_preferences")
      .select("memory, prefers_direct_answers, web_search_enabled, code_mode_enabled")
      .eq("owner_id", guestId)
      .maybeSingle();
    const { data: userPreferences } = await supabase
      .from("user_preferences")
      .select("memory, prefers_direct_answers, web_search_enabled, code_mode_enabled")
      .eq("owner_id", userId)
      .maybeSingle();

    if (guestPreferences) {
      await supabase.from("user_preferences").upsert({
        owner_id: userId,
        memory: mergeRememberedMemory(
          userPreferences?.memory || "",
          guestPreferences.memory || ""
        ),
        prefers_direct_answers:
          userPreferences?.prefers_direct_answers ?? guestPreferences.prefers_direct_answers ?? true,
        web_search_enabled:
          userPreferences?.web_search_enabled ?? guestPreferences.web_search_enabled ?? true,
        code_mode_enabled:
          userPreferences?.code_mode_enabled ?? guestPreferences.code_mode_enabled ?? false,
        updated_at: new Date().toISOString()
      });

      await supabase.from("user_preferences").delete().eq("owner_id", guestId);
    }

    return NextResponse.json({
      success: true,
      moved: guestChats.length
    });
  } catch (error) {
    const friendly = getFriendlyApiError(error, "Failed to migrate guest chats.");
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}
