export type ParsedFileMessage = {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  extractedText: string;
  extractionStatus: string;
};

export function parseFileMessage(content: string): ParsedFileMessage | null {
  if (!content.startsWith("FILETEXT::")) return null;

  const parts = content.split("::");
  if (parts.length < 6) return null;

  return {
    fileName: decodeURIComponent(parts[1] || ""),
    fileUrl: decodeURIComponent(parts[2] || ""),
    mimeType: decodeURIComponent(parts[3] || ""),
    extractedText: decodeURIComponent(parts[4] || ""),
    extractionStatus: decodeURIComponent(parts[5] || "")
  };
}

export function buildFileMessageContent(params: ParsedFileMessage) {
  return `FILETEXT::${encodeURIComponent(params.fileName)}::${encodeURIComponent(
    params.fileUrl
  )}::${encodeURIComponent(params.mimeType)}::${encodeURIComponent(
    params.extractedText
  )}::${encodeURIComponent(params.extractionStatus)}`;
}

export function compactFileMessageForApi(parsed: ParsedFileMessage) {
  if (parsed.extractedText && parsed.extractedText.trim().length > 0) {
    const shorterText =
      parsed.extractedText.length > 15000
        ? parsed.extractedText.slice(0, 15000)
        : parsed.extractedText;

    return [
      "The user uploaded a file.",
      `File name: ${parsed.fileName}`,
      `File type: ${parsed.mimeType}`,
      "Use the extracted file content below to answer the user's next question.",
      "",
      "BEGIN FILE CONTENT",
      shorterText,
      "END FILE CONTENT"
    ].join("\n");
  }

  return [
    "The user uploaded a file.",
    `File name: ${parsed.fileName}`,
    `File type: ${parsed.mimeType}`,
    parsed.fileUrl.startsWith("data:image/")
      ? "A local document preview image is attached for visual analysis."
      : `File URL: ${parsed.fileUrl || "[unavailable]"}`
  ].join("\n");
}

export function deriveChatTitleFromMessage(content: string) {
  const parsed = parseFileMessage(content);

  if (parsed?.fileName) {
    return `File: ${parsed.fileName}`.slice(0, 50);
  }

  return String(content || "New Chat").slice(0, 50);
}
