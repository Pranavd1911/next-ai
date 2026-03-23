import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  MAX_OCR_IMAGES,
  getFriendlyApiError,
  validateFile
} from "@/lib/api-guards";
import { resolveRequestOwnerId } from "@/lib/server-data";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;
const OCR_EARLY_EXIT_TEXT_LENGTH = 700;
const EMBEDDED_TEXT_SUFFICIENT_LENGTH = 120;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// ------------------------
// Extract embedded text
// ------------------------
async function extractEmbeddedText(file: File, buffer: Buffer) {
  const mimeType = file.type || "application/octet-stream";
  const fileName = file.name.toLowerCase();

  try {
    if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
      const pdfParseModule = await import("pdf-parse");
      const PDFParse = (pdfParseModule as { PDFParse?: unknown }).PDFParse;
      const PDFParseCtor = PDFParse as
        | (new (options: { data: Buffer }) => {
            getText: (params?: { first?: number }) => Promise<{ text?: string }>;
            destroy: () => Promise<void>;
          })
        | undefined;

      if (typeof PDFParseCtor !== "function") {
        throw new Error("pdf-parse did not export the PDFParse class.");
      }

      const parser = new PDFParseCtor({ data: buffer });

      try {
        const result = await parser.getText({
          first: 5
        });
        return (result?.text || "").trim();
      } finally {
        await parser.destroy();
      }
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
}

async function saveCachedExtraction(params: {
  ownerId: string;
  fileHash: string;
  mimeType: string;
  extractedText: string;
  extractionStatus: string;
}) {
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
}

// ------------------------
// MAIN ROUTE
// ------------------------
export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const userId = (formData.get("userId") as string) || null;
    const guestId = (formData.get("guestId") as string) || null;
    let chatId = (formData.get("chatId") as string) || null;

    const ownerId = await resolveRequestOwnerId(req, { userId, guestId });

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

    // ------------------------
    // UPLOAD FILE
    // ------------------------
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const safeName = file.name.replace(/\s+/g, "_");
    const filePath = `${ownerId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("uploads")
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("uploads")
      .getPublicUrl(filePath);

    const fileUrl = publicUrlData.publicUrl;
    const mimeType = file.type || "application/octet-stream";

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

      if (extractedText.trim().length >= EMBEDDED_TEXT_SUFFICIENT_LENGTH) {
        extractionStatus = "TEXT_EXTRACTED";
      } else if (ocrImages.length > 0) {
        let combinedText = extractedText.trim();

        for (const img of ocrImages) {
          const pageText = await runVisionOcr(img);
          if (pageText.trim()) {
            combinedText = [combinedText, pageText.trim()]
              .filter(Boolean)
              .join("\n\n");
          }

          if (combinedText.length >= OCR_EARLY_EXIT_TEXT_LENGTH) {
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

    return NextResponse.json({
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
  } catch (error) {
    const friendly = getFriendlyApiError(
      error,
      "File upload failed. Please try a smaller supported file."
    );

    return NextResponse.json(
      { error: friendly.message },
      { status: friendly.status }
    );
  }
}
