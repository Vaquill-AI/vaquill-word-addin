import { request } from "./http";

/**
 * Bluebook citation-format check. Complements the existence check
 * (GET /us/citation-lookup) with a FORMAT verdict per citation. Single-word
 * fields, so the camelCase wire shape matches as-is.
 *
 * Backend: POST /api/v1/us/citation-style.
 */
export interface CitationStyleResult {
  citation: string;
  compliant: boolean;
  issues: string[];
  suggested: string;
}

interface StyleResponse {
  results: CitationStyleResult[];
}

export async function checkCitationStyle(
  citations: string[],
  signal?: AbortSignal,
): Promise<CitationStyleResult[]> {
  const res = await request<StyleResponse>("/api/v1/us/citation-style", {
    method: "POST",
    body: { citations },
    signal,
  });
  return res.results ?? [];
}
