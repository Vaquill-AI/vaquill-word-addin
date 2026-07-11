import type { ComplianceStatusValue } from "@/api/clause-tools";
import type { GuidelineVerdict } from "@/api/guidelines";
import type { StatusTone } from "@/ui/status";

/**
 * Display order for compliance statuses: gaps first (what the reviewer must act
 * on), then partial, then compliant, then not-applicable. Missing/unknown
 * statuses are coalesced into `not_applicable` for grouping.
 */
export const STATUS_ORDER: ComplianceStatusValue[] = [
  "non_compliant",
  "partially_compliant",
  "compliant",
  "not_applicable",
];

export function coerceStatus(s: ComplianceStatusValue | undefined | null): ComplianceStatusValue {
  return s === "compliant" || s === "partially_compliant" || s === "non_compliant"
    ? s
    : "not_applicable";
}

export function statusTone(s?: ComplianceStatusValue): StatusTone {
  switch (s) {
    case "compliant":
      return "green";
    case "partially_compliant":
      return "yellow";
    case "non_compliant":
      return "red";
    default:
      return "neutral";
  }
}

/** Short pill label (dense). */
export function statusLabel(s?: ComplianceStatusValue): string {
  switch (s) {
    case "compliant":
      return "Compliant";
    case "partially_compliant":
      return "Partial";
    case "non_compliant":
      return "Gap";
    case "not_applicable":
      return "N/A";
    default:
      return "Unknown";
  }
}

/** Full label for group headers. */
export function statusHeading(s?: ComplianceStatusValue): string {
  switch (s) {
    case "compliant":
      return "Compliant";
    case "partially_compliant":
      return "Partially compliant";
    case "non_compliant":
      return "Non-compliant";
    default:
      return "Not applicable";
  }
}

/** Score band -> tone, for the overall score chip. */
export function scoreTone(score: number): StatusTone {
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

// ---- Guideline verdicts (custom guideline checklist mode) ------------------

/**
 * Display order for guideline verdicts: what fails first (not_met), then
 * partial, then met, then unclear. Mirrors the regulation checklist ordering so
 * both modes read the same. Unknown verdicts are coalesced into `unclear`.
 */
export const VERDICT_ORDER: GuidelineVerdict[] = ["not_met", "partial", "met", "unclear"];

export function coerceVerdict(v: GuidelineVerdict | undefined | null): GuidelineVerdict {
  return v === "met" || v === "partial" || v === "not_met" ? v : "unclear";
}

export function verdictTone(v?: GuidelineVerdict): StatusTone {
  switch (v) {
    case "met":
      return "green";
    case "partial":
      return "yellow";
    case "not_met":
      return "red";
    default:
      return "neutral";
  }
}

/** Short pill label (dense). */
export function verdictLabel(v?: GuidelineVerdict): string {
  switch (v) {
    case "met":
      return "Met";
    case "partial":
      return "Partial";
    case "not_met":
      return "Not met";
    default:
      return "Unclear";
  }
}

/** Full label for group headers. */
export function verdictHeading(v?: GuidelineVerdict): string {
  switch (v) {
    case "met":
      return "Met";
    case "partial":
      return "Partially met";
    case "not_met":
      return "Not met";
    default:
      return "Unclear";
  }
}
