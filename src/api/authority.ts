import { request } from "./http";
import { ApiError } from "./errors";

/**
 * Authority verification against Vaquill AI's US case-law corpus.
 * Endpoint: GET /api/v1/us/citation-lookup?citation=... (JWT, 30-day cached).
 * Returns an array (one entry per detected citation); status 200 + a matched
 * cluster means a real case, while an unmatched one is a possible hallucination
 * to verify before relying on it.
 */

export type Verdict = "verified" | "no_match" | "unrecognized" | "error";

export interface AuthorityResult {
  raw: string;
  count: number;
  verdict: Verdict;
  caseName?: string;
  court?: string;
  year?: string;
  /** the case-law source cluster id (used to build a link + fetch treatment). */
  clusterId?: number;
  /** Full, clickable case URL (relative absolute_url is dead on its own). */
  caseUrl?: string;
  /** Cases that cite this opinion (forward citations / treatment signal). */
  citedByCount?: number;
}

interface Cluster {
  id?: number;
  case_name?: string;
  caseName?: string;
  case_name_short?: string;
  court?: string;
  court_id?: string;
  date_filed?: string;
  absolute_url?: string;
}
interface LookupEntry {
  citation?: string;
  status?: number | string;
  clusters?: Cluster[];
}

/**
 * Backend does not camelCase these fields (no serialization_alias on
 * USCitationsResponse), so they arrive snake_case exactly as serialized.
 */
interface CitationsResponse {
  authority_count?: number;
  cited_by_count?: number;
}

/** Public host that renders a the case-law source opinion page. */
const CASE_HOST = "https://example.com";

function cleanCourt(court?: string): string | undefined {
  if (!court || court.startsWith("http")) return undefined;
  return court;
}

/** Turn a (usually relative) absolute_url into a real, clickable link. */
function buildCaseUrl(absoluteUrl?: string): string | undefined {
  if (!absoluteUrl) return undefined;
  if (absoluteUrl.startsWith("http")) return absoluteUrl;
  return `${CASE_HOST}${absoluteUrl.startsWith("/") ? "" : "/"}${absoluteUrl}`;
}

/**
 * Best-effort forward-citation (treatment) count for a matched case.
 * Returns undefined on any failure so a match is never downgraded by it.
 */
async function fetchCitedByCount(
  clusterId: number,
  signal?: AbortSignal,
): Promise<number | undefined> {
  try {
    const res = await request<CitationsResponse>(`/api/v1/us/case/${clusterId}/citations`, {
      signal,
    });
    const n = res?.cited_by_count;
    return typeof n === "number" && n >= 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export async function verifyCitation(
  raw: string,
  count: number,
  signal?: AbortSignal,
): Promise<AuthorityResult> {
  try {
    const res = await request<LookupEntry[]>(
      `/api/v1/us/citation-lookup?citation=${encodeURIComponent(raw)}`,
      { signal },
    );
    const entry = Array.isArray(res) ? res[0] : undefined;
    if (!entry) return { raw, count, verdict: "unrecognized" };

    const cluster = entry.clusters?.[0];
    // Mirror backend leniency: a non-empty clusters array is a match. Only a
    // parse-only failure (status present AND not 200) is not. status may be
    // absent or stringified, so coerce before comparing.
    const statusOk = entry.status == null || Number(entry.status) === 200;
    if (cluster && statusOk) {
      const clusterId = typeof cluster.id === "number" ? cluster.id : undefined;
      const citedByCount =
        clusterId !== undefined ? await fetchCitedByCount(clusterId, signal) : undefined;
      return {
        raw,
        count,
        verdict: "verified",
        caseName: cluster.case_name ?? cluster.caseName ?? cluster.case_name_short,
        court: cleanCourt(cluster.court ?? cluster.court_id),
        year: (cluster.date_filed ?? "").slice(0, 4) || undefined,
        clusterId,
        caseUrl: buildCaseUrl(cluster.absolute_url),
        citedByCount,
      };
    }
    // Parsed as a citation but no matching case in the corpus: a real
    // possible-hallucination signal for the reviewer.
    return { raw, count, verdict: "no_match" };
  } catch (e) {
    if (e instanceof ApiError && e.kind === "not_found") return { raw, count, verdict: "no_match" };
    if (e instanceof ApiError && e.kind === "rate_limited") throw e; // bubble to stop the scan
    return { raw, count, verdict: "error" };
  }
}
