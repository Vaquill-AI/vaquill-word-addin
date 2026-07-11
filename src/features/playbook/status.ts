import type { PlaybookFitVerdict } from "@/api/playbook-fit";
import type { StatusTone } from "@/ui/status";

/**
 * Verdict -> tone / label helpers for the playbook fit report. Local to the
 * playbook feature (the compliance feature owns its own guideline verdicts); this
 * keeps the two surfaces independent while reusing the shared status tokens.
 *
 * Display order: what the reviewer must act on first (below the floor), then on a
 * fallback rung, then not addressed, then clean (on standard). Unknown verdicts
 * are coalesced into `not_addressed`.
 */
export const FIT_VERDICT_ORDER: PlaybookFitVerdict[] = [
  "below_floor",
  "meets_fallback",
  "not_addressed",
  "meets_standard",
];

export function coerceFitVerdict(v: PlaybookFitVerdict | undefined | null): PlaybookFitVerdict {
  return v === "meets_standard" || v === "meets_fallback" || v === "below_floor"
    ? v
    : "not_addressed";
}

export function fitVerdictTone(v?: PlaybookFitVerdict): StatusTone {
  switch (v) {
    case "meets_standard":
      return "green";
    case "meets_fallback":
      return "yellow";
    case "below_floor":
      return "red";
    default:
      return "neutral";
  }
}

/** Short pill label (dense). */
export function fitVerdictLabel(v?: PlaybookFitVerdict): string {
  switch (v) {
    case "meets_standard":
      return "On standard";
    case "meets_fallback":
      return "On a fallback";
    case "below_floor":
      return "Below floor";
    default:
      return "Not addressed";
  }
}

/** Full label for group headers (bucket names). */
export function fitVerdictHeading(v?: PlaybookFitVerdict): string {
  switch (v) {
    case "meets_standard":
      return "On standard";
    case "meets_fallback":
      return "On a fallback";
    case "below_floor":
      return "Below floor";
    default:
      return "Not addressed";
  }
}
