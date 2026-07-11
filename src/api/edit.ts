import { request } from "./http";

/**
 * Whole-document, instruction-driven edits. Send the open document's text plus a
 * plain-English instruction and get back grounded edits (each anchored to
 * verbatim current language) to render as redline cards.
 *
 * Backend: POST /api/v1/drafting/edit-document. Fields are camelCase on the wire
 * (sectionReference / currentLanguage / proposedLanguage).
 */
export interface EditItem {
  label: string;
  sectionReference: string;
  currentLanguage: string;
  proposedLanguage: string;
  rationale: string;
}

interface EditResponse {
  edits: EditItem[];
}

export async function editDocument(
  documentText: string,
  instruction: string,
  signal?: AbortSignal,
): Promise<EditItem[]> {
  const res = await request<EditResponse>("/api/v1/drafting/edit-document", {
    method: "POST",
    body: { documentText, instruction },
    signal,
  });
  return res.edits ?? [];
}
