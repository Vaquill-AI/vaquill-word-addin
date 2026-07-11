import { requestForm } from "./http";

/**
 * Fill-from-reference: upload a reference document and get a grounded value for
 * each placeholder in the open template. Every returned value is backed by a
 * verbatim quote from the reference (the backend drops any that don't verify),
 * so a filled value is auditable, not hallucinated.
 *
 * Backend: POST /api/v1/drafting/fill-from-reference (multipart). Response is
 * camelCase (referenceChars); the per-fill fields are single-word so they match.
 */
export interface FillItem {
  placeholder: string;
  found: boolean;
  value: string;
  quote: string;
}

export interface FillResponse {
  fills: FillItem[];
  referenceChars: number;
  truncated: boolean;
}

export async function fillFromReference(
  file: File,
  placeholders: string[],
): Promise<FillResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("placeholders", JSON.stringify(placeholders));
  return requestForm<FillResponse>("/api/v1/drafting/fill-from-reference", form);
}
