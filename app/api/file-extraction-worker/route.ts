import { NextResponse } from "next/server";
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
import {
  finishRequestTrace,
  startRequestTrace
} from "@/lib/request-tracing";

const WORKER_SECRET = process.env.INTERNAL_WORKER_SECRET || "";

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

function isWorkerAuthorized(req: Request) {
  if (!WORKER_SECRET) {
    return process.env.NODE_ENV !== "production";
  }
  const bearer = req.headers.get("authorization") || "";
  const token = bearer.toLowerCase().startsWith("bearer ")
    ? bearer.slice(7).trim()
    : req.headers.get("x-worker-secret") || "";
  return token === WORKER_SECRET;
}

async function processJob(job: ExtractionJobRecord) {
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

export async function POST(req: Request) {
  const trace = startRequestTrace("api/file-extraction-worker");

  try {
    if (!isWorkerAuthorized(req)) {
      const response = NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({ trace, status: 401 });
      return response;
    }

    const { data: jobs, error } = await supabaseAdmin
      .from("file_extraction_jobs")
      .select("id, owner_id, file_hash, chat_id, message_id, mime_type, status, storage_path, preview_image_data, attempts")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(3);

    if (error) {
      const response = NextResponse.json({ error: error.message }, { status: 500 });
      response.headers.set("X-Request-Id", trace.requestId);
      await finishRequestTrace({
        trace,
        status: 500,
        metadata: { error: error.message }
      });
      return response;
    }

    const processed: Array<Record<string, unknown>> = [];

    for (const job of (jobs || []) as ExtractionJobRecord[]) {
      await supabaseAdmin
        .from("file_extraction_jobs")
        .update({
          status: "processing",
          attempts: (job.attempts || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);

      try {
        processed.push(await processJob(job));
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

    const response = NextResponse.json({ processed });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: 200,
      metadata: { processedCount: processed.length }
    });
    return response;
  } catch (error) {
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "Worker failed." },
      { status: 500 }
    );
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: 500,
      metadata: {
        error: error instanceof Error ? error.message : "Worker failed."
      }
    });
    return response;
  }
}
