import { requestForm } from "./http";
import { isCommunity } from "@/community/edition";

/**
 * Extract plain text from an uploaded document so it can be attached as ad-hoc
 * grounding context for the assistant (and drafting). The add-in cannot parse
 * PDF/DOCX in the browser, so the file is sent to the backend, which reuses the
 * shared reference-document extractor and returns the text.
 *
 * Backend: POST /api/v1/drafting/extract-text (multipart). Response is camelCase
 * (all fields are single words, so they match as-is).
 */
export interface ExtractedText {
  /** The extracted plain text (already truncated server-side if very large). */
  text: string;
  /** Original pre-truncation character count, for a truthful "N chars" label. */
  chars: number;
  /** True when the original exceeded the extractor's cap and was truncated. */
  truncated: boolean;
  /** Echoed filename, if the server had one. */
  filename: string;
  /** Community edition only: for a file sent to the provider AS A FILE (a PDF)
   *  rather than extracted to text, the raw bytes base64-encoded plus the MIME
   *  type. Absent for text-extracted files and for the hosted backend. */
  fileData?: string;
  mediaType?: string;
}

/**
 * Accept list for the attach-file affordances, per edition. The hosted build
 * extracts on the backend (pdf / docx / doc / txt). The community build has no
 * backend: it extracts docx / txt / md to text in the browser, and sends pdf
 * straight to the user's own LLM provider as a file (both OpenAI and Anthropic
 * read PDFs, including scanned ones). Legacy .doc is still not offered -- no
 * provider accepts the Office binary and the browser cannot parse it.
 */
export function attachAccept(): string {
  return isCommunity() ? ".pdf,.docx,.txt,.md" : ".pdf,.docx,.doc,.txt";
}

export async function extractFileText(file: File): Promise<ExtractedText> {
  const form = new FormData();
  form.append("file", file);
  return requestForm<ExtractedText>("/api/v1/drafting/extract-text", form);
}
