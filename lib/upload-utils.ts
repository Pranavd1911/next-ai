export const OCR_EARLY_EXIT_TEXT_LENGTH = 700;
export const EMBEDDED_TEXT_SUFFICIENT_LENGTH = 120;

export function hasSufficientEmbeddedText(text: string) {
  return text.trim().length >= EMBEDDED_TEXT_SUFFICIENT_LENGTH;
}

export function mergeExtractedTextSegments(currentText: string, nextText: string) {
  return [currentText.trim(), nextText.trim()].filter(Boolean).join("\n\n").trim();
}

export function shouldStopEarlyDuringOcr(text: string) {
  return text.trim().length >= OCR_EARLY_EXIT_TEXT_LENGTH;
}

