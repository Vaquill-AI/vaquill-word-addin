import { request, requestBinary } from "./http";

/**
 * Saved drafts: list the user's prior Vaquill AI drafts and pull one into the open
 * document. Reuses the same server export the web app uses, so a draft inserts
 * with its formatting preserved (via `insertDocxAtCursorOrDownload`). Continuity
 * for a lawyer resuming work that started on the web or in an earlier session.
 *
 * Backend base: /api/v1/drafting/drafts (responses camelCase via serialization_alias).
 */
const BASE = "/api/v1/drafting/drafts";

export interface DraftListItem {
  id: string;
  title: string;
  category: string;
  status: string;
  version: number;
  source: string | null;
  updatedAt: string | null;
  /** pending | running | completed | failed | null. In-flight drafts can't insert. */
  generationStatus: string | null;
}

/** List the user's drafts, newest first. */
export async function listDrafts(
  opts: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<DraftListItem[]> {
  const p = new URLSearchParams();
  p.set("limit", String(opts.limit ?? 50));
  p.set("offset", String(opts.offset ?? 0));
  return request<DraftListItem[]>(`${BASE}?${p.toString()}`, { signal });
}

/** Export a draft to a .docx (base64) for insertion into the open document. */
export async function exportDraftDocx(
  id: string,
  signal?: AbortSignal,
): Promise<{ base64: string; filename: string }> {
  const p = new URLSearchParams({ format: "docx" });
  return requestBinary(`${BASE}/${encodeURIComponent(id)}/export?${p.toString()}`, {
    method: "GET",
    signal,
  });
}
