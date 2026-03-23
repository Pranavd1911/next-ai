import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

type PdfTextExtractionOptions = {
  maxPages?: number;
};

export async function extractPdfTextFromBuffer(
  buffer: Buffer,
  options: PdfTextExtractionOptions = {}
) {
  const maxPages = options.maxPages ?? 5;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false
  } as any);

  try {
    const pdf = await loadingTask.promise;
    const textSegments: string[] = [];
    const totalPages = Math.min(pdf.numPages, maxPages);

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent({
        disableNormalization: false
      });

      const pageText = textContent.items
        .map((item) => {
          if (!("str" in item) || typeof item.str !== "string") {
            return "";
          }

          return item.str;
        })
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (pageText) {
        textSegments.push(pageText);
      }

      page.cleanup();
    }

    await pdf.destroy();
    return textSegments.join("\n\n").trim();
  } finally {
    await loadingTask.destroy();
  }
}
