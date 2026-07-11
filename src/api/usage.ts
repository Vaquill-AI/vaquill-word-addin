import { request } from "./http";

/**
 * Current-user usage / quota snapshot.
 *
 * Backed by GET /api/v1/quotas/summary (QuotaSummaryResponse in
 * app/models/schemas.py). The response is camelCase on the wire: `tierName`,
 * `usage.monthlyMessages`, `usage.monthlyDeepSearches`,
 * `usage.monthlyLegalToolUses`, `usage.monthlyFullDrafts`. Each usage metric is
 * a `{ current, limit, percentage }` object (QuotaUsageMetric has no aliases).
 * The add-in does NOT auto-camelCase, so field names here must match exactly.
 *
 * All of the per-metric tiles are optional server-side (unmetered tiers leave
 * them null), so every field is guarded and parsed defensively. Anything the
 * endpoint omits or malforms becomes null rather than throwing.
 */

export interface UsageMetric {
  current: number;
  limit: number;
  percentage: number;
}

export interface QuotaSnapshot {
  tier: string;
  tierName: string;
  /** One entry per surface the add-in cares about; null when unmetered/absent. */
  messages: UsageMetric | null;
  deepSearches: UsageMetric | null;
  legalTools: UsageMetric | null;
  fullDrafts: UsageMetric | null;
}

/** Raw wire shape (only the fields we read). Everything optional/null-guarded. */
interface RawMetric {
  current?: unknown;
  limit?: unknown;
  percentage?: unknown;
}
interface RawUsage {
  monthlyMessages?: RawMetric | null;
  monthlyDeepSearches?: RawMetric | null;
  monthlyLegalToolUses?: RawMetric | null;
  monthlyFullDrafts?: RawMetric | null;
}
interface RawSummary {
  tier?: unknown;
  tierName?: unknown;
  usage?: RawUsage | null;
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Coerce one wire metric into a UsageMetric, or null if it is unusable. */
function parseMetric(raw: RawMetric | null | undefined): UsageMetric | null {
  if (!raw || typeof raw !== "object") return null;
  const current = toNumber(raw.current);
  const limit = toNumber(raw.limit);
  if (current === null || limit === null) return null;
  const pct = toNumber(raw.percentage);
  return {
    current,
    limit,
    // Derive a percentage when the server omitted it; guard divide-by-zero.
    percentage: pct ?? (limit > 0 ? Math.min(100, (current / limit) * 100) : 0),
  };
}

/**
 * Fetch the signed-in user's usage snapshot. Returns null when the response is
 * missing or unrecognizable so callers can render an "usage unavailable" state.
 * Network / auth errors propagate (the shared request() handles the 401 retry).
 */
export async function fetchUsageSnapshot(signal?: AbortSignal): Promise<QuotaSnapshot | null> {
  const res = await request<RawSummary>("/api/v1/quotas/summary", { signal });
  if (!res || typeof res !== "object") return null;

  const usage = res.usage ?? null;
  return {
    tier: typeof res.tier === "string" ? res.tier : "",
    tierName: typeof res.tierName === "string" ? res.tierName : "",
    messages: parseMetric(usage?.monthlyMessages),
    deepSearches: parseMetric(usage?.monthlyDeepSearches),
    legalTools: parseMetric(usage?.monthlyLegalToolUses),
    fullDrafts: parseMetric(usage?.monthlyFullDrafts),
  };
}
