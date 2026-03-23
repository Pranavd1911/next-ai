import { createClient } from "@supabase/supabase-js";
import { ApiValidationError } from "@/lib/api-guards";

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

export type MemoryItemRecord = {
  id: string;
  owner_id: string;
  content: string;
  created_at: string;
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

export async function getMemoryItems(ownerId: string) {
  const { data } = await supabaseAdmin
    .from("memory_items")
    .select("id, owner_id, content, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data || []) as MemoryItemRecord[];
}

export async function syncPreferenceMemory(ownerId: string) {
  const memoryItems = await getMemoryItems(ownerId);
  const memory = memoryItems
    .map((item) => item.content.trim())
    .filter(Boolean)
    .reverse()
    .join("\n")
    .slice(0, 2000);

  const existing = await getUserPreferences(ownerId);

  await supabaseAdmin.from("user_preferences").upsert({
    owner_id: ownerId,
    memory,
    prefers_direct_answers: existing.prefers_direct_answers,
    web_search_enabled: existing.web_search_enabled,
    code_mode_enabled: existing.code_mode_enabled,
    updated_at: new Date().toISOString()
  });

  return memory;
}

export async function createMemoryItem(ownerId: string, content: string) {
  const normalized = content.trim().replace(/\s+/g, " ").slice(0, 220);
  if (!normalized) return null;

  const { data: existing } = await supabaseAdmin
    .from("memory_items")
    .select("id, owner_id, content, created_at")
    .eq("owner_id", ownerId)
    .ilike("content", normalized)
    .maybeSingle();

  if (existing) {
    return existing as MemoryItemRecord;
  }

  const { data } = await supabaseAdmin
    .from("memory_items")
    .insert({
      owner_id: ownerId,
      content: normalized
    })
    .select("id, owner_id, content, created_at")
    .single();

  await syncPreferenceMemory(ownerId);
  return (data as MemoryItemRecord | null) || null;
}

export async function deleteMemoryItem(ownerId: string, memoryId: string) {
  await supabaseAdmin
    .from("memory_items")
    .delete()
    .eq("owner_id", ownerId)
    .eq("id", memoryId);

  await syncPreferenceMemory(ownerId);
}

export async function enforceDistributedRateLimit(params: {
  ownerId: string;
  route: string;
  limit: number;
  windowSeconds: number;
}) {
  const cutoff = new Date(Date.now() - params.windowSeconds * 1000).toISOString();

  const { data: existing } = await supabaseAdmin
    .from("rate_limit_events")
    .select("id")
    .eq("owner_id", params.ownerId)
    .eq("route", params.route)
    .gte("created_at", cutoff)
    .limit(params.limit);

  if ((existing || []).length >= params.limit) {
    throw new ApiValidationError(
      "Too many requests. Please slow down and try again.",
      429
    );
  }

  await supabaseAdmin.from("rate_limit_events").insert({
    owner_id: params.ownerId,
    route: params.route
  });
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

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

export async function resolveRequestOwnerId(
  req: Request,
  params: { userId?: string | null; guestId?: string | null }
) {
  const userId = params.userId || null;
  const guestId = params.guestId || null;

  if (userId) {
    const token = getBearerToken(req);
    if (!token) {
      throw new ApiValidationError("Authentication required.", 401);
    }

    const {
      data: { user },
      error
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      throw new ApiValidationError("Invalid session.", 401);
    }

    if (user.id !== userId) {
      throw new ApiValidationError("Authenticated user mismatch.", 403);
    }

    return user.id;
  }

  if (guestId) {
    return guestId;
  }

  throw new ApiValidationError("Missing userId or guestId.", 400);
}
