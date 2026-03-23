import {
  extractEmbeddedTextFromBuffer,
  getCachedExtraction,
  runVisionOcr,
  saveCachedExtraction,
  supabaseAdmin
} from "@/lib/file-extraction-server";
import { buildFileMessageContent, parseFileMessage } from "@/lib/file-messages";
import {
  mergeExtractedTextSegments,
  shouldStopEarlyDuringOcr
} from "@/lib/upload-utils";

type ExtractionJobRecord = {
  id: string;
  owner_id: string;
  file_hash: string;
  chat_id: string | null;
  message_id: string | null;
  mime_type: string;
  status: string;
  storage_path: string;
  preview_image_data: string;
  attempts: number;
};

let supportsExtractionJobMessageIdColumn: boolean | null = null;
let fileExtractionJobsSchemaSupported = true;
let loggedExtractionJobsSchemaWarning = false;

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
    "Queued file extraction is disabled until the latest Supabase schema is applied:",
    error
  );
}

async function processFileExtractionJob(job: ExtractionJobRecord) {
  let extractedText = "";
  let extractionStatus = "NO_TEXT_EXTRACTED";

  const cached = await getCachedExtraction(job.owner_id, job.file_hash);
  if (cached) {
    extractedText = cached.extractedText;
    extractionStatus = cached.extractionStatus;
  } else {
    if (job.storage_path) {
      const { data } = await supabaseAdmin.storage
        .from("uploads")
        .download(job.storage_path);

      if (data) {
        const buffer = Buffer.from(await data.arrayBuffer());
        extractedText = await extractEmbeddedTextFromBuffer({
          fileName: job.storage_path,
          mimeType: job.mime_type,
          buffer
        });
      }
    }

    if (job.preview_image_data) {
      let combinedText = extractedText.trim();
      const pageText = await runVisionOcr(job.preview_image_data);
      if (pageText.trim()) {
        combinedText = mergeExtractedTextSegments(combinedText, pageText);
      }
      if (shouldStopEarlyDuringOcr(combinedText) || combinedText.trim().length > 0) {
        extractedText = combinedText.trim();
      }
    }

    extractionStatus = extractedText ? "OCR_TEXT_EXTRACTED" : "NO_TEXT_EXTRACTED";
    await saveCachedExtraction({
      ownerId: job.owner_id,
      fileHash: job.file_hash,
      mimeType: job.mime_type,
      extractedText,
      extractionStatus
    });
  }

  if (job.message_id) {
    const { data: message } = await supabaseAdmin
      .from("messages")
      .select("content")
      .eq("id", job.message_id)
      .maybeSingle();

    const parsed = parseFileMessage(message?.content || "");
    if (parsed) {
      const updatedContent = buildFileMessageContent({
        fileName: parsed.fileName,
        fileUrl: parsed.fileUrl,
        mimeType: parsed.mimeType,
        extractedText: extractedText.slice(0, 20000),
        extractionStatus
      });

      await supabaseAdmin
        .from("messages")
        .update({ content: updatedContent })
        .eq("id", job.message_id);
    }
  }

  await supabaseAdmin
    .from("file_extraction_jobs")
    .update({
      status: "completed",
      error_message: "",
      updated_at: new Date().toISOString()
    })
    .eq("id", job.id);

  return {
    id: job.id,
    extractionStatus,
    extractedLength: extractedText.length
  };
}

export async function processQueuedExtractionJobs(params?: {
  ownerId?: string | null;
  chatId?: string | null;
  limit?: number;
}) {
  if (!fileExtractionJobsSchemaSupported) {
    return [];
  }

  const limit = Math.min(Math.max(params?.limit ?? 1, 1), 3);
  let query = supabaseAdmin
    .from("file_extraction_jobs")
    .select(
      supportsExtractionJobMessageIdColumn === false
        ? "id, owner_id, file_hash, chat_id, mime_type, status, storage_path, preview_image_data, attempts"
        : "id, owner_id, file_hash, chat_id, message_id, mime_type, status, storage_path, preview_image_data, attempts"
    )
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (params?.ownerId) {
    query = query.eq("owner_id", params.ownerId);
  }

  if (params?.chatId) {
    query = query.eq("chat_id", params.chatId);
  }

  const initialResult = await query;
  let jobs: ExtractionJobRecord[] | null = initialResult.data as ExtractionJobRecord[] | null;
  let error = initialResult.error;

  if (error && error.message.toLowerCase().includes("message_id")) {
    supportsExtractionJobMessageIdColumn = false;
    const fallback = await supabaseAdmin
      .from("file_extraction_jobs")
      .select("id, owner_id, file_hash, chat_id, mime_type, status, storage_path, preview_image_data, attempts")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(limit);
    jobs = fallback.data as ExtractionJobRecord[] | null;
    error = fallback.error;
  } else if (!error && supportsExtractionJobMessageIdColumn === null) {
    supportsExtractionJobMessageIdColumn = true;
  }

  if (error) {
    if (isFileExtractionJobsSchemaMismatch(error)) {
      fileExtractionJobsSchemaSupported = false;
      warnExtractionJobsSchemaMismatch(error);
      return [];
    }
    throw new Error(error.message);
  }

  const processed: Array<Record<string, unknown>> = [];

  for (const job of (jobs || []) as ExtractionJobRecord[]) {
    const { data: claimedJob } = await supabaseAdmin
      .from("file_extraction_jobs")
      .update({
        status: "processing",
        attempts: (job.attempts || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();

    if (!claimedJob) {
      continue;
    }

    try {
      processed.push(await processFileExtractionJob(job));
    } catch (jobError) {
      await supabaseAdmin
        .from("file_extraction_jobs")
        .update({
          status: "failed",
          error_message:
            jobError instanceof Error ? jobError.message : "Unknown extraction failure",
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);
    }
  }

  return processed;
}
