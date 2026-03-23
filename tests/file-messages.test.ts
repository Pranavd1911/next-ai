import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFileMessageContent,
  compactFileMessageForApi,
  deriveChatTitleFromMessage,
  parseFileMessage
} from "../lib/file-messages.ts";

test("buildFileMessageContent round-trips through parseFileMessage", () => {
  const content = buildFileMessageContent({
    fileName: "Resume.pdf",
    fileUrl: "https://example.com/resume.pdf",
    mimeType: "application/pdf",
    extractedText: "hello world",
    extractionStatus: "TEXT_EXTRACTED"
  });

  assert.deepEqual(parseFileMessage(content), {
    fileName: "Resume.pdf",
    fileUrl: "https://example.com/resume.pdf",
    mimeType: "application/pdf",
    extractedText: "hello world",
    extractionStatus: "TEXT_EXTRACTED"
  });
});

test("compactFileMessageForApi strips large local data urls from fallback previews", () => {
  const compacted = compactFileMessageForApi({
    fileName: "IELTS Score Card.pdf",
    fileUrl: "data:image/jpeg;base64,abc123",
    mimeType: "image/jpeg",
    extractedText: "",
    extractionStatus: "OCR_IMAGE_READY"
  });

  assert.equal(compacted.includes("data:image/jpeg"), false);
  assert.equal(
    compacted.includes("A local document preview image is attached for visual analysis."),
    true
  );
});

test("deriveChatTitleFromMessage uses file names for file messages", () => {
  const content = buildFileMessageContent({
    fileName: "IELTS Score Card.pdf",
    fileUrl: "",
    mimeType: "application/pdf",
    extractedText: "",
    extractionStatus: "NO_TEXT_EXTRACTED"
  });

  assert.equal(deriveChatTitleFromMessage(content), "File: IELTS Score Card.pdf");
  assert.equal(deriveChatTitleFromMessage("hello world"), "hello world");
});
