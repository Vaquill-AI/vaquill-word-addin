import { ApiError } from "@/api/errors";
import { getCourtListenerToken } from "@/ai/keys";

/**
 * Browser-direct CourtListener case-law verification for the community edition.
 *
 * CourtListener sends permissive CORS headers, so the add-in can call it from the
 * task pane with the user's own free token. The batch citation-lookup endpoint is
 * POST-only and NOT allowed cross-origin, so we use the GET /search/ endpoint
 * (one search per citation) and map the result into the shape the existing
 * authority UI already consumes. Free tokens are rate-limited (about 5/min), so
 * the scan (which is sequential and stops on 429) surfaces that gracefully.
 */
const BASE = "https://www.courtlistener.com/api/rest/v4";

interface CLSearchResult {
  cluster_id?: number;
  caseName?: string;
  court?: string;
  dateFiled?: string;
  absolute_url?: string;
}
interface CLSearchResponse {
  count?: number;
  results?: CLSearchResult[];
}

/** The LookupEntry[] shape src/api/authority.ts expects from citation-lookup. */
interface LookupEntry {
  citation: string;
  status: number;
  clusters: {
    id?: number;
    case_name?: string;
    court?: string;
    date_filed?: string;
    absolute_url?: string;
  }[];
}

export async function searchCitation(raw: string): Promise<LookupEntry[]> {
  const token = getCourtListenerToken();
  if (!token) {
    throw new ApiError(
      "unauthorized",
      401,
      "Add your CourtListener token in Settings to check citations.",
      "NO_CL_TOKEN",
    );
  }
  const url = `${BASE}/search/?type=o&q=${encodeURIComponent(`"${raw}"`)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Token ${token}` } });
  } catch {
    throw new ApiError("network", 0, "Cannot reach CourtListener.");
  }
  if (res.status === 429) {
    // Bubble as rate_limited so the scan stops cleanly and reports what it checked.
    throw new ApiError("rate_limited", 429, "CourtListener rate limit reached.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new ApiError("unauthorized", res.status, "Your CourtListener token was rejected.", "INVALID_CL_TOKEN");
  }
  if (!res.ok) throw new ApiError("server", res.status, "CourtListener request failed.");

  const data = (await res.json()) as CLSearchResponse;
  const first = data.results?.[0];
  if ((data.count ?? 0) > 0 && first) {
    return [
      {
        citation: raw,
        status: 200,
        clusters: [
          {
            id: first.cluster_id,
            case_name: first.caseName,
            court: first.court,
            date_filed: first.dateFiled,
            absolute_url: first.absolute_url,
          },
        ],
      },
    ];
  }
  return [{ citation: raw, status: 404, clusters: [] }];
}
