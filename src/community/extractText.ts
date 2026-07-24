import mammoth from "mammoth";
import { ApiError } from "@/api/errors";

/**
 * Client-side document handling for the community edition, replacing the backend
 * document extractor. There is no server, so each format is handled on-device:
 *   - .docx  -> text via mammoth
 *   - .txt / .md -> text natively
 *   - .pdf   -> NOT extracted; the raw bytes are returned base64-encoded so the
 *               caller can send the PDF straight to the user's LLM provider,
 *               which reads it (text and scanned pages) itself.
 * Legacy .doc stays unsupported: no provider accepts the binary and the browser
 * cannot parse it, so we point the user at Save As .docx.
 */
export interface ExtractedFile {
  text: string;
  filename: string;
  /** Set only for a file returned AS A FILE (a PDF): the raw bytes base64-encoded
   *  (no data: prefix, no newlines) plus its MIME type. `text` is empty then. */
  fileData?: string;
  mediaType?: string;
}

const MAX_CHARS = 300_000;
/** Guard against attaching a PDF larger than providers accept (Anthropic caps at
 *  32MB; OpenAI is similar). Base64 inflates ~33%, so we check the raw size. */
const MAX_PDF_BYTES = 32 * 1024 * 1024;

/** Encode an ArrayBuffer to base64 without newlines. Chunked so a large PDF does
 *  not blow the argument limit of String.fromCharCode via a spread. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

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

  if (lower.endsWith(".pdf")) {
    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PDF_BYTES) {
      throw new ApiError(
        "invalid",
        0,
        "This PDF is too large to send (limit 32MB). Attach a smaller file.",
        "FILE_TOO_LARGE",
      );
    }
    return { text: "", filename: name, fileData: toBase64(arrayBuffer), mediaType: "application/pdf" };
  }

  throw new ApiError(
    "invalid",
    0,
    "Attach a .pdf, .docx, .txt, or .md file. For a legacy .doc, open it in Word and Save As .docx first.",
    "UNSUPPORTED_FILE",
  );
}
