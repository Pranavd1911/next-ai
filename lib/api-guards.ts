export const MAX_CHAT_MESSAGES = 40;
export const MAX_MESSAGE_CHARS = 8000;
export const MAX_TOTAL_MESSAGE_CHARS = 40000;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_OCR_IMAGES = 5;

export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp"
]);

export type NormalizedChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class ApiValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiValidationError";
    this.status = status;
  }
}

export function getFriendlyApiError(
  error: unknown,
  fallback: string
) {
  if (error instanceof ApiValidationError) {
    return {
      status: error.status,
      message: error.message
    };
  }

  return {
    status: 500,
    message: fallback
  };
}

export function normalizeMessages(messages: unknown): NormalizedChatMessage[] {
  if (!Array.isArray(messages)) {
    throw new ApiValidationError("Messages are required.");
  }

  const normalized = messages
    .filter((m): m is { role: string; content: string } => {
      return (
        !!m &&
        typeof m === "object" &&
        "role" in m &&
        "content" in m &&
        typeof (m as { role: unknown }).role === "string" &&
        typeof (m as { content: unknown }).content === "string"
      );
    })
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant" || m.role === "system") &&
        m.content.trim().length > 0
    )
    .map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content.trim()
    }));

  if (normalized.length === 0) {
    throw new ApiValidationError("Messages are required.");
  }

  if (normalized.length > MAX_CHAT_MESSAGES) {
    throw new ApiValidationError(
      `Too many messages in one request. Limit: ${MAX_CHAT_MESSAGES}.`
    );
  }

  const totalChars = normalized.reduce((sum, message) => {
    if (message.content.length > MAX_MESSAGE_CHARS) {
      throw new ApiValidationError(
        `A message is too long. Limit: ${MAX_MESSAGE_CHARS} characters.`
      );
    }

    return sum + message.content.length;
  }, 0);

  if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
    throw new ApiValidationError(
      `Conversation is too large. Limit: ${MAX_TOTAL_MESSAGE_CHARS} characters.`
    );
  }

  return normalized;
}

export function requireOwnerId(userId?: string | null, guestId?: string | null) {
  const ownerId = userId || guestId;

  if (!ownerId || typeof ownerId !== "string" || ownerId.trim().length === 0) {
    throw new ApiValidationError("Missing userId or guestId.");
  }

  return ownerId.trim();
}

export function validateModel(model: unknown) {
  if (model === "openai" || model === "claude") return model;
  return "openai";
}

export function validateMode(mode: unknown) {
  if (typeof mode !== "string" || mode.trim().length === 0) {
    return "general";
  }

  return mode;
}

export function validateFile(file: File) {
  const mimeType = file.type || "application/octet-stream";
  const lowerName = file.name.toLowerCase();
  const allowedByExtension =
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".json") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".webp");

  const allowedType =
    ALLOWED_UPLOAD_MIME_TYPES.has(mimeType) || allowedByExtension;

  if (!allowedType) {
    throw new ApiValidationError(
      "Unsupported file type. Upload PDF, text, JSON, CSV, PNG, JPG, or WEBP."
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ApiValidationError(
      `File is too large. Max size is ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB.`
    );
  }
}

const memoryRateLimitStore = new Map<string, number[]>();

export function enforceMemoryRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const entries = memoryRateLimitStore.get(params.key) || [];
  const recent = entries.filter((timestamp) => now - timestamp < params.windowMs);

  if (recent.length >= params.limit) {
    throw new ApiValidationError(
      "Too many requests in a short time. Please wait a moment and try again.",
      429
    );
  }

  recent.push(now);
  memoryRateLimitStore.set(params.key, recent);
}
