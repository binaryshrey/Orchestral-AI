import { Mistral } from "@mistralai/mistralai";
import { clipForPrompt } from "@/lib/projectScoping";

const OCR_MODEL = "mistral-ocr-latest";
const PDF_FETCH_TIMEOUT_MS = 45_000;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_OCR_TEXT_CHARS = 18_000;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function extractTextFromPage(page: unknown): string {
  if (!isRecord(page)) return "";

  const textCandidates = [
    page.markdown,
    page.text,
    page.content,
    page.raw_text,
    page.rawText,
  ];

  for (const candidate of textCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (Array.isArray(page.blocks)) {
    const fromBlocks = page.blocks
      .map((block) => {
        if (!isRecord(block)) return "";
        const blockText = block.text;
        if (typeof blockText === "string") return blockText.trim();
        return "";
      })
      .filter(Boolean)
      .join("\n");
    if (fromBlocks.trim()) return fromBlocks.trim();
  }

  return "";
}

function extractTextFromOcrResponse(payload: unknown): {
  text: string;
  pageCount: number;
} {
  if (!isRecord(payload)) {
    return { text: "", pageCount: 0 };
  }

  const pageTexts: string[] = [];
  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  for (const page of pages) {
    const extracted = extractTextFromPage(page);
    if (extracted) {
      pageTexts.push(extracted);
    }
  }

  if (pageTexts.length > 0) {
    return {
      text: pageTexts.join("\n\n"),
      pageCount: pages.length || pageTexts.length,
    };
  }

  const topLevelCandidates = [
    payload.markdown,
    payload.text,
    payload.content,
    payload.raw_text,
  ];
  for (const candidate of topLevelCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return { text: candidate.trim(), pageCount: pages.length };
    }
  }

  return { text: "", pageCount: pages.length };
}

async function fetchPdfAsBase64(pdfUrl: string): Promise<string> {
  const trimmed = pdfUrl.trim();
  if (!trimmed) {
    throw new Error("Empty pdf_url");
  }

  if (trimmed.startsWith("data:application/pdf;base64,")) {
    return trimmed.slice("data:application/pdf;base64,".length);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(trimmed, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF (${response.status})`);
    }

    const contentLength = Number.parseInt(
      response.headers.get("content-length") ?? "0",
      10,
    );
    if (Number.isFinite(contentLength) && contentLength > MAX_PDF_BYTES) {
      throw new Error(
        `PDF too large (${contentLength} bytes). Max supported is ${MAX_PDF_BYTES} bytes.`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PDF_BYTES) {
      throw new Error(
        `PDF too large (${arrayBuffer.byteLength} bytes). Max supported is ${MAX_PDF_BYTES} bytes.`,
      );
    }

    return Buffer.from(arrayBuffer).toString("base64");
  } finally {
    clearTimeout(timeout);
  }
}

export type PdfOcrResult = {
  extractedText: string;
  pageCount: number;
  sourceUrl: string;
};

export async function extractPdfTextWithMistral(params: {
  pdfUrl: string;
  apiKey: string;
}): Promise<PdfOcrResult> {
  const { pdfUrl, apiKey } = params;
  const client = new Mistral({ apiKey });
  const base64Pdf = await fetchPdfAsBase64(pdfUrl);

  const ocrResponse = await client.ocr.process({
    model: OCR_MODEL,
    document: {
      type: "document_url",
      documentUrl: `data:application/pdf;base64,${base64Pdf}`,
    },
    tableFormat: "html",
    includeImageBase64: true,
  });

  const extracted = extractTextFromOcrResponse(ocrResponse as unknown);
  return {
    extractedText: clipForPrompt(extracted.text, MAX_OCR_TEXT_CHARS),
    pageCount: extracted.pageCount,
    sourceUrl: pdfUrl,
  };
}
