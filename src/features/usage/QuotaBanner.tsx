import { useEffect, useState } from "react";
import { Banner } from "@/ui/primitives";
import { XIcon } from "@/ui/icons";
import { fetchUsageSnapshot, type QuotaSnapshot, type UsageMetric } from "@/api/usage";
import { config } from "@/config";
import "./quota-banner.css";

/**
 * Unobtrusive in-pane usage nudge. Shows ONLY when the user's nearest metered
 * limit is close (>= THRESHOLD%), with an upgrade link. Renders nothing while
 * loading, on error, on unmetered plans, below the threshold, or once dismissed
 * for the current month. Self-fetches; safe to drop into any view.
 */

const THRESHOLD = 80;
const DISMISS_KEY = "vaquill.quotaBannerDismissed";

const METRICS: { key: keyof QuotaSnapshot; noun: string }[] = [
  { key: "messages", noun: "messages" },
  { key: "deepSearches", noun: "deep research runs" },
  { key: "legalTools", noun: "legal tool uses" },
  { key: "fullDrafts", noun: "drafts" },
];

/** The metered surface closest to its limit, or null if none is metered. */
function nearestLimit(snapshot: QuotaSnapshot): { noun: string; metric: UsageMetric } | null {
  let best: { noun: string; metric: UsageMetric } | null = null;
  for (const { key, noun } of METRICS) {
    const metric = snapshot[key];
    if (!metric || typeof metric !== "object" || metric.limit <= 0) continue;
    if (!best || metric.percentage > best.metric.percentage) best = { noun, metric };
  }
  return best;
}

/** Current year-month, so a dismissal lasts the month and re-nudges next month. */
function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export function QuotaBanner() {
  const [snapshot, setSnapshot] = useState<QuotaSnapshot | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === monthKey()) setDismissed(true);
    } catch {
      // localStorage unavailable; treat as not dismissed.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchUsageSnapshot(controller.signal)
      .then((s) => setSnapshot(s))
      .catch(() => setSnapshot(null));
    return () => controller.abort();
  }, []);

  if (dismissed || !snapshot) return null;

  const nearest = nearestLimit(snapshot);
  if (!nearest || nearest.metric.percentage < THRESHOLD) return null;

  const { noun, metric } = nearest;
  const atLimit = metric.current >= metric.limit;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, monthKey());
    } catch {
      // Persisting the dismissal failed; it will re-show next mount. Acceptable.
    }
  }

  return (
    <Banner tone={atLimit ? "danger" : "warn"}>
      <div className="quota-banner">
        <span className="small">
          {atLimit
            ? `You've used all ${metric.limit} ${noun} on your ${snapshot.tierName || "plan"} this month.`
            : `You've used ${metric.current} of ${metric.limit} ${noun} this month.`}
        </span>
        <span className="quota-banner__actions">
          <a
            className="small"
            href={`${config.appBase}/pricing`}
            target="_blank"
            rel="noreferrer"
          >
            Upgrade
          </a>
          <button
            type="button"
            className="quota-banner__dismiss"
            aria-label="Dismiss"
            onClick={dismiss}
          >
            <XIcon size={14} />
          </button>
        </span>
      </div>
    </Banner>
  );
}
