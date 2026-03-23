import { createClient } from "@supabase/supabase-js";
import { extractPdfTextFromBuffer } from "./pdf-extraction.ts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function extractEmbeddedTextFromBuffer(params: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const mimeType = params.mimeType || "application/octet-stream";
  const fileName = params.fileName.toLowerCase();

  try {
    if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
      return await extractPdfTextFromBuffer(params.buffer, { maxPages: 5 });
    }

    if (
      mimeType.startsWith("text/") ||
      fileName.endsWith(".txt") ||
      fileName.endsWith(".md") ||
      fileName.endsWith(".csv") ||
      fileName.endsWith(".json")
    ) {
      return params.buffer.toString("utf-8").trim();
    }

    return "";
  } catch (error) {
    console.error("Embedded text extraction failed:", error);
    return "";
  }
}

export async function runVisionOcr(imageDataUrl: string) {
  if (!openaiKey || !imageDataUrl) return "";

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

export async function getCachedExtraction(ownerId: string, fileHash: string) {
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

export async function saveCachedExtraction(params: {
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

export { supabaseAdmin };
