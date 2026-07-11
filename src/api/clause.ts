import { requestForm } from "./http";

/**
 * Cross-document clause transplant: pull a named clause verbatim from an uploaded
 * SOURCE contract to insert into the open document. The backend returns the
 * clause only when it verifies as a literal substring of the source (grounded),
 * so nothing invented is transplanted.
 *
 * Backend: POST /api/v1/drafting/extract-clause (multipart). Single-word fields.
 */
export interface ExtractedClause {
  found: boolean;
  label: string;
  text: string;
}

export async function extractClause(file: File, clause: string): Promise<ExtractedClause> {
  const form = new FormData();
  form.append("file", file);
  form.append("clause", clause);
  return requestForm<ExtractedClause>("/api/v1/drafting/extract-clause", form);
}
