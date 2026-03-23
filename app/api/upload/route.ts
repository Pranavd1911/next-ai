import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  MAX_OCR_IMAGES,
  getFriendlyApiError,
  validateFile
} from "@/lib/api-guards";
import { resolveRequestOwnerId, upsertFileExtractionJob } from "@/lib/server-data";
import {
  hasSufficientEmbeddedText,
  mergeExtractedTextSegments,
  shouldStopEarlyDuringOcr
} from "@/lib/upload-utils";
import {
  finishRequestTrace,
  startRequestTrace
} from "@/lib/request-tracing";
import {
  extractEmbeddedTextFromBuffer,
  getCachedExtraction,
  saveCachedExtraction,
  runVisionOcr,
  supabaseAdmin
} from "@/lib/file-extraction-server";
import { buildFileMessageContent } from "@/lib/file-messages";

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
    let shouldQueueDeepExtraction = false;

    if (cachedExtraction) {
      extractedText = cachedExtraction.extractedText;
      extractionStatus = cachedExtraction.extractionStatus;
    } else {
      extractedText = await extractEmbeddedTextFromBuffer({
        fileName: file.name,
        mimeType,
        buffer
      });

      if (hasSufficientEmbeddedText(extractedText)) {
        extractionStatus = "TEXT_EXTRACTED";
      } else if (ocrImages.length > 0 && !storageUploadSucceeded) {
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
      } else if (ocrImages.length > 0 && storageUploadSucceeded) {
        extractionStatus = "PROCESSING";
        shouldQueueDeepExtraction = true;
      }

      if (!shouldQueueDeepExtraction) {
        await saveCachedExtraction({
          ownerId,
          fileHash,
          mimeType,
          extractedText,
          extractionStatus
        });
      }
    }

    extractedText = extractedText.slice(0, 20000);

    console.log("Extraction status:", extractionStatus);
    console.log("Extracted length:", extractedText.length);

    // ------------------------
    // STORE MESSAGE
    // ------------------------
    const messageContent = buildFileMessageContent({
      fileName: file.name,
      fileUrl,
      mimeType,
      extractedText,
      extractionStatus
    });

    const { data: insertedMessage, error: insertError } = await supabaseAdmin
      .from("messages")
      .insert({
      chat_id: chatId,
      role: "user",
      content: messageContent
      })
      .select("id")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    extractionJobId = await upsertFileExtractionJob({
      ownerId,
      fileHash,
      chatId,
      messageId: insertedMessage?.id || null,
      mimeType: currentMimeType,
      status: shouldQueueDeepExtraction ? "queued" : "completed",
      storagePath: storageUploadSucceeded ? filePath : "",
      previewImageData: ocrImages[0] || "",
      attempts: 0
    });

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
