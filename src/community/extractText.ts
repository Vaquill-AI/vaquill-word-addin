import mammoth from "mammoth";
import { ApiError } from "@/api/errors";

/**
 * Client-side text extraction for the community edition, replacing the backend
 * document extractor. Handles the common reference formats without a server:
 * .docx via mammoth, and .txt/.md natively. PDF and legacy .doc are not supported
 * client-side yet and return a clear message rather than failing oddly.
 */
export interface ExtractedFile {
  text: string;
  filename: string;
}

const MAX_CHARS = 300_000;

export async function extractTextFromFile(file: File): Promise<ExtractedFile> {
  const name = file.name || "document";
  const lower = name.toLowerCase();

  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    const text = await file.text();
    return { text: text.slice(0, MAX_CHARS), filename: name };
  }

  if (lower.endsWith(".docx")) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { text: result.value.slice(0, MAX_CHARS), filename: name };
  }

  throw new ApiError(
    "invalid",
    0,
    "In the community edition, attach a .docx, .txt, or .md file. PDF and .doc are not supported yet.",
    "UNSUPPORTED_FILE",
  );
}
