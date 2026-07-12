import { requestForm } from "./http";

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
}

/** Accept list shared by every attach affordance (matches the backend parser). */
export const ATTACH_ACCEPT = ".pdf,.docx,.doc,.txt";

export async function extractFileText(file: File): Promise<ExtractedText> {
  const form = new FormData();
  form.append("file", file);
  return requestForm<ExtractedText>("/api/v1/drafting/extract-text", form);
}
