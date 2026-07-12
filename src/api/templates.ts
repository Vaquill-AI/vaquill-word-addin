import { request, requestBinary } from "./http";

/**
 * Firm template library: browse the seeded starter templates (plus the user's
 * own) and insert one into the open document. The template's .docx is fetched
 * server-side and inserted via Office.js base64 file insertion, preserving its
 * formatting (rather than re-rendering TipTap client-side).
 *
 * Backend base: /api/v1/templates (responses camelCase via serialization_alias).
 */
const BASE = "/api/v1/templates";

export interface Template {
  id: string;
  title: string;
  description: string | null;
  category: string;
  isSystem: boolean;
  state: string | null;
  practiceArea: string | null;
  variableCount: number;
}

export interface TemplateListResult {
  items: Template[];
  total: number;
  hasMore: boolean;
}

export async function listTemplates(
  opts: { search?: string; category?: string; state?: string; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<TemplateListResult> {
  const p = new URLSearchParams();
  if (opts.search) p.set("search", opts.search);
  if (opts.category) p.set("category", opts.category);
  if (opts.state) p.set("state", opts.state);
  p.set("includeSystem", "true");
  p.set("limit", String(opts.limit ?? 30));
  p.set("offset", String(opts.offset ?? 0));
  return request<TemplateListResult>(`${BASE}?${p.toString()}`, { signal });
}

/**
 * Fetch a template rendered to a .docx (base64) for insertion. Uses the
 * authenticated POST `/{id}/export-docx` route (not the unauthenticated,
 * system-only GET `/{id}/export.docx`), so the caller's own and org-shared
 * templates render too, subject to the same `_assert_template_owned` check.
 * requestBinary defaults to POST, so no method override is needed.
 */
export async function getTemplateDocx(
  id: string,
  signal?: AbortSignal,
): Promise<{ base64: string; filename: string }> {
  return requestBinary(`${BASE}/${encodeURIComponent(id)}/export-docx`, { signal });
}
