import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  MAX_OCR_IMAGES,
  getFriendlyApiError,
  validateFile
} from "@/lib/api-guards";
import { resolveRequestOwnerId, upsertFileExtractionJob } from "@/lib/server-data";
import { extractPdfTextFromBuffer } from "@/lib/pdf-extraction";
import {
  hasSufficientEmbeddedText,
  mergeExtractedTextSegments,
  shouldStopEarlyDuringOcr
} from "@/lib/upload-utils";
import {
  finishRequestTrace,
  startRequestTrace
} from "@/lib/request-tracing";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// ------------------------
// Extract embedded text
// ------------------------
async function extractEmbeddedText(file: File, buffer: Buffer) {
  const mimeType = file.type || "application/octet-stream";
  const fileName = file.name.toLowerCase();

  try {
    if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
      return await extractPdfTextFromBuffer(buffer, { maxPages: 5 });
    }

    if (
      mimeType.startsWith("text/") ||
      fileName.endsWith(".txt") ||
      fileName.endsWith(".md") ||
      fileName.endsWith(".csv") ||
      fileName.endsWith(".json")
    ) {
      return buffer.toString("utf-8").trim();
    }

    return "";
  } catch (error) {
    console.error("Embedded text extraction failed:", error);
    return "";
  }
}

// ------------------------
// OCR using OpenAI Vision
// ------------------------
async function runVisionOcr(imageDataUrl: string) {
  if (!openaiKey) return "";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You extract text from document images. Return only the text. No explanation."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all readable text from this document."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                  detail: "low"
                }
              }
            ]
          }
        ]
      })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("OCR API error:", data);
      return "";
    }

    return (data?.choices?.[0]?.message?.content || "").trim();
  } catch (error) {
    console.error("Vision OCR failed:", error);
    return "";
  }
}

async function getCachedExtraction(ownerId: string, fileHash: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from("file_extractions")
      .select("extracted_text, extraction_status")
      .eq("owner_id", ownerId)
      .eq("file_hash", fileHash)
      .maybeSingle();

    if (error || !data) return null;

    return {
      extractedText: typeof data.extracted_text === "string" ? data.extracted_text : "",
      extractionStatus:
        typeof data.extraction_status === "string"
          ? data.extraction_status
          : "NO_TEXT_EXTRACTED"
    };
  } catch (error) {
    console.error("File extraction cache read failed:", error);
    return null;
  }
}

async function saveCachedExtraction(params: {
  ownerId: string;
  fileHash: string;
  mimeType: string;
  extractedText: string;
  extractionStatus: string;
}) {
  try {
    await supabaseAdmin.from("file_extractions").upsert(
      {
        owner_id: params.ownerId,
        file_hash: params.fileHash,
        mime_type: params.mimeType,
        extracted_text: params.extractedText,
        extraction_status: params.extractionStatus,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "owner_id,file_hash"
      }
    );
  } catch (error) {
    console.error("File extraction cache write failed:", error);
  }
}

// ------------------------
// MAIN ROUTE
// ------------------------
export async function POST(req: Request) {
  const trace = startRequestTrace("api/upload");
  let ownerId: string | null = null;
  let activeChatId: string | null = null;
  let extractionJobId: string | null = null;
  let currentFileHash: string | null = null;
  let currentMimeType = "";

  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const userId = (formData.get("userId") as string) || null;
    const guestId = (formData.get("guestId") as string) || null;
    let chatId = (formData.get("chatId") as string) || null;

    ownerId = await resolveRequestOwnerId(req, { userId, guestId });

    if (!file) {
      return NextResponse.json(
        { error: "No file received." },
        { status: 400 }
      );
    }

    validateFile(file);

    // ------------------------
    // GET MULTIPLE OCR IMAGES
    // ------------------------
    const ocrImages: string[] = [];

    for (let i = 0; i < MAX_OCR_IMAGES; i++) {
      const img = formData.get(`ocrImageDataUrl_${i}`) as string;
      if (img && img.startsWith("data:image/")) ocrImages.push(img);
    }

    console.log("OCR images received:", ocrImages.length);

    // ------------------------
    // CREATE CHAT IF NEEDED
    // ------------------------
    if (chatId) {
      const { data: existingChat, error: chatError } = await supabaseAdmin
        .from("chats")
        .select("id, user_id")
        .eq("id", chatId)
        .single();

      if (chatError || !existingChat) {
        return NextResponse.json(
          { error: "Chat not found." },
          { status: 404 }
        );
      }

      if (existingChat.user_id !== ownerId) {
        return NextResponse.json(
          { error: "Unauthorized chat access." },
          { status: 403 }
        );
      }
    }

    if (!chatId) {
      const { data: newChat, error: chatError } = await supabaseAdmin
        .from("chats")
        .insert({
          user_id: ownerId,
          title: `File: ${file.name}`.slice(0, 50)
        })
        .select()
        .single();

      if (chatError || !newChat) {
        return NextResponse.json(
          { error: chatError?.message || "Failed to create chat." },
          { status: 500 }
        );
      }

      chatId = newChat.id;
    }
    activeChatId = chatId;

    // ------------------------
    // UPLOAD FILE
    // ------------------------
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    currentFileHash = fileHash;
    currentMimeType = file.type || "application/octet-stream";
    const safeName = file.name.replace(/\s+/g, "_");
    const filePath = `${ownerId}/${Date.now()}-${safeName}`;
    extractionJobId = await upsertFileExtractionJob({
      ownerId,
      fileHash,
      chatId,
      mimeType: currentMimeType,
      status: "processing"
    });

    let fileUrl = "";
    let storageUploadSucceeded = false;

    try {
      const { error: uploadError } = await supabaseAdmin.storage
        .from("uploads")
        .upload(filePath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false
        });

      if (uploadError) {
        console.error("File storage upload failed:", uploadError);
      } else {
        const { data: publicUrlData } = supabaseAdmin.storage
          .from("uploads")
          .getPublicUrl(filePath);

        fileUrl = publicUrlData.publicUrl || "";
        storageUploadSucceeded = fileUrl.length > 0;
      }
    } catch (error) {
      console.error("File storage pipeline failed:", error);
    }

    const mimeType = currentMimeType || file.type || "application/octet-stream";

    // ------------------------
    // TEXT EXTRACTION
    // ------------------------
    const cachedExtraction = await getCachedExtraction(ownerId, fileHash);
    let extractedText = "";
    let extractionStatus = "NO_TEXT_EXTRACTED";

    if (cachedExtraction) {
      extractedText = cachedExtraction.extractedText;
      extractionStatus = cachedExtraction.extractionStatus;
    } else {
      extractedText = await extractEmbeddedText(file, buffer);

      if (hasSufficientEmbeddedText(extractedText)) {
        extractionStatus = "TEXT_EXTRACTED";
      } else if (ocrImages.length > 0) {
        let combinedText = extractedText.trim();

        for (const img of ocrImages) {
          const pageText = await runVisionOcr(img);
          if (pageText.trim()) {
            combinedText = mergeExtractedTextSegments(combinedText, pageText);
          }

          if (shouldStopEarlyDuringOcr(combinedText)) {
            break;
          }
        }

        extractedText = combinedText.trim();
        extractionStatus = extractedText
          ? "OCR_TEXT_EXTRACTED"
          : "NO_TEXT_EXTRACTED";
      }

      await saveCachedExtraction({
        ownerId,
        fileHash,
        mimeType,
        extractedText,
        extractionStatus
      });
    }

    await upsertFileExtractionJob({
      ownerId,
      fileHash,
      chatId,
      mimeType,
      status: "completed"
    });

    extractedText = extractedText.slice(0, 20000);

    console.log("Extraction status:", extractionStatus);
    console.log("Extracted length:", extractedText.length);

    // ------------------------
    // STORE MESSAGE
    // ------------------------
    const messageContent = `FILETEXT::${encodeURIComponent(
      file.name
    )}::${encodeURIComponent(fileUrl)}::${encodeURIComponent(
      mimeType
    )}::${encodeURIComponent(extractedText)}::${encodeURIComponent(
      extractionStatus
    )}`;

    const { error: insertError } = await supabaseAdmin.from("messages").insert({
      chat_id: chatId,
      role: "user",
      content: messageContent
    });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      chatId,
      fileName: file.name,
      fileUrl,
      mimeType,
      extractedText,
      extractionStatus,
      extractedLength: extractedText.length,
      messageContent
    });
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: 200,
      ownerId,
      chatId: activeChatId,
      metadata: {
        mimeType,
        extractionStatus,
        cachedExtraction: !!cachedExtraction,
        storageUploadSucceeded,
        extractionJobId
      }
    });
    return response;
  } catch (error) {
    const friendly = getFriendlyApiError(
      error,
      "File upload failed. Please try a smaller supported file."
    );

    const response = NextResponse.json(
      { error: friendly.message },
      { status: friendly.status }
    );
    response.headers.set("X-Request-Id", trace.requestId);
    await finishRequestTrace({
      trace,
      status: friendly.status,
      ownerId,
      chatId: activeChatId,
      metadata: {
        extractionJobId,
        error:
          error instanceof Error ? error.message : "Unknown upload failure"
      }
    });
    if (ownerId && currentFileHash) {
      await upsertFileExtractionJob({
        ownerId,
        fileHash: currentFileHash,
        chatId: activeChatId,
        mimeType: currentMimeType,
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Unknown upload failure"
      });
    }
    return response;
  }
}
