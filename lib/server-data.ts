import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export type UserPreferenceRecord = {
  owner_id: string;
  memory: string;
  prefers_direct_answers: boolean;
  web_search_enabled: boolean;
  code_mode_enabled: boolean;
  updated_at?: string;
};

export async function getUserPreferences(ownerId: string) {
  const { data } = await supabaseAdmin
    .from("user_preferences")
    .select(
      "owner_id, memory, prefers_direct_answers, web_search_enabled, code_mode_enabled, updated_at"
    )
    .eq("owner_id", ownerId)
    .maybeSingle();

  return (
    (data as UserPreferenceRecord | null) || {
      owner_id: ownerId,
      memory: "",
      prefers_direct_answers: true,
      web_search_enabled: true,
      code_mode_enabled: false
    }
  );
}

export async function trackAnalyticsEvent(params: {
  ownerId?: string | null;
  eventName: string;
  chatId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("analytics_events").insert({
    owner_id: params.ownerId || null,
    event_name: params.eventName,
    chat_id: params.chatId || null,
    metadata: params.metadata || {}
  });
}
