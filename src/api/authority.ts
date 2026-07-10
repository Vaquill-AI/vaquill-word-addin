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
  url?: string;
}

interface Cluster {
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
  status?: number;
  clusters?: Cluster[];
}

function cleanCourt(court?: string): string | undefined {
  if (!court || court.startsWith("http")) return undefined;
  return court;
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
    if (entry.status === 200 && cluster) {
      return {
        raw,
        count,
        verdict: "verified",
        caseName: cluster.case_name ?? cluster.caseName ?? cluster.case_name_short,
        court: cleanCourt(cluster.court ?? cluster.court_id),
        year: (cluster.date_filed ?? "").slice(0, 4) || undefined,
        url: cluster.absolute_url,
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
