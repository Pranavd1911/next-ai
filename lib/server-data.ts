import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { ApiValidationError } from "./api-guards.ts";
import { mergeRememberedMemory } from "./user-memory.ts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const guestSessionSecret = process.env.GUEST_SESSION_SECRET || serviceRoleKey;
const GUEST_SESSION_COOKIE = "nexa_guest_session";
let supportsExtractionJobMessageIdColumn: boolean | null = null;
let fileExtractionJobsSchemaSupported = true;
let loggedExtractionJobsSchemaWarning = false;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

function isFileExtractionJobsSchemaMismatch(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" &&
            error !== null &&
            "message" in error &&
            typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : "";
  const lower = message.toLowerCase();

  return lower.includes("file_extraction_jobs") && (
    lower.includes("schema cache") ||
    lower.includes("column")
  );
}

function warnExtractionJobsSchemaMismatch(error: unknown) {
  if (loggedExtractionJobsSchemaWarning) return;
  loggedExtractionJobsSchemaWarning = true;
  console.warn(
    "File extraction job tracking is disabled until the latest Supabase schema is applied:",
    error
  );
}

function normalizeLegacyGuestId(guestId?: string | null) {
  if (typeof guestId !== "string") return null;
  const normalized = guestId.trim();
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(normalized)) return null;
  return normalized;
}

function signGuestSession(guestId: string) {
  return createHmac("sha256", guestSessionSecret).update(guestId).digest("hex");
}

function encodeGuestSession(guestId: string) {
  return `${guestId}.${signGuestSession(guestId)}`;
}

function decodeGuestSession(value?: string | null) {
  if (!value || typeof value !== "string") return null;

  const boundary = value.lastIndexOf(".");
  if (boundary <= 0 || boundary === value.length - 1) return null;

  const guestId = value.slice(0, boundary);
  const signature = value.slice(boundary + 1);
  const expected = signGuestSession(guestId);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  return guestId;
}

async function resolveGuestOwnerId(legacyGuestId?: string | null) {
  const cookieStore = await cookies();
  const existing = decodeGuestSession(cookieStore.get(GUEST_SESSION_COOKIE)?.value);

  if (existing) {
    return existing;
  }

  const guestId = normalizeLegacyGuestId(legacyGuestId) || randomUUID();

  cookieStore.set(GUEST_SESSION_COOKIE, encodeGuestSession(guestId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });

  return guestId;
}

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

export async function upsertFileExtractionJob(params: {
  ownerId: string;
  fileHash: string;
  chatId?: string | null;
  messageId?: string | null;
  mimeType: string;
  status: "queued" | "processing" | "completed" | "failed";
  errorMessage?: string;
  storagePath?: string;
  previewImageData?: string;
  attempts?: number;
}) {
  if (!fileExtractionJobsSchemaSupported) {
    return null;
  }

  try {
    const payload = {
      owner_id: params.ownerId,
      file_hash: params.fileHash,
      chat_id: params.chatId || null,
      message_id: params.messageId || null,
      mime_type: params.mimeType,
      status: params.status,
      error_message: params.errorMessage || "",
      storage_path: params.storagePath || "",
      preview_image_data: params.previewImageData || "",
      attempts: params.attempts ?? 0,
      updated_at: new Date().toISOString()
    };
    const fallbackPayload = {
      owner_id: params.ownerId,
      file_hash: params.fileHash,
      chat_id: params.chatId || null,
      mime_type: params.mimeType,
      status: params.status,
      error_message: params.errorMessage || "",
      storage_path: params.storagePath || "",
      preview_image_data: params.previewImageData || "",
      attempts: params.attempts ?? 0,
      updated_at: new Date().toISOString()
    };

    const { data: existing } = await supabaseAdmin
      .from("file_extraction_jobs")
      .select("id")
      .eq("owner_id", params.ownerId)
      .eq("file_hash", params.fileHash)
      .maybeSingle();

    if (existing?.id) {
      await supabaseAdmin
        .from("file_extraction_jobs")
        .update(payload)
        .eq("id", existing.id);
      return existing.id;
    }

    let insertBuilder = supabaseAdmin
      .from("file_extraction_jobs")
      .insert(supportsExtractionJobMessageIdColumn === false ? fallbackPayload : payload)
      .select("id")
      .single();

    let { data, error } = await insertBuilder;

    if (
      error &&
      error.message.toLowerCase().includes("message_id")
    ) {
      supportsExtractionJobMessageIdColumn = false;
      const fallbackInsert = await supabaseAdmin
        .from("file_extraction_jobs")
        .insert(fallbackPayload)
        .select("id")
        .single();
      data = fallbackInsert.data;
      error = fallbackInsert.error;
    } else if (!error && supportsExtractionJobMessageIdColumn === null) {
      supportsExtractionJobMessageIdColumn = true;
    }

    if (error) {
      throw new Error(error.message);
    }

    return data?.id || null;
  } catch (error) {
    if (isFileExtractionJobsSchemaMismatch(error)) {
      fileExtractionJobsSchemaSupported = false;
      warnExtractionJobsSchemaMismatch(error);
      return null;
    }
    console.error("File extraction job tracking failed:", error);
    return null;
  }
}

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

export async function requireAuthenticatedUserId(
  req: Request,
  expectedUserId?: string | null
) {
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

  if (expectedUserId && user.id !== expectedUserId) {
    throw new ApiValidationError("Authenticated user mismatch.", 403);
  }

  return user.id;
}

export async function resolveRequestOwnerId(
  req: Request,
  params: { userId?: string | null; guestId?: string | null }
) {
  const userId = params.userId || null;
  const guestId = params.guestId || null;

  if (userId) {
    return requireAuthenticatedUserId(req, userId);
  }

  return resolveGuestOwnerId(guestId);
}
