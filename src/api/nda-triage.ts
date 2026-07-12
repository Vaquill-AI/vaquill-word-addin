import { request } from "./http";

/**
 * NDA triage: a fast, standardized 10-criteria screen of an inbound NDA that
 * classifies it GREEN / YELLOW / RED, distinct from the full contract review.
 * It answers the in-house "can I sign this NDA in seconds, or does it need
 * counsel?" question. Backend: POST /api/v1/legal-tools/nda-triage (blocking
 * JSON, 2x quota). Responses are camelCase via serialization_alias.
 */
const NDA_TRIAGE = "/api/v1/legal-tools/nda-triage";

export type NdaClassification = "green" | "yellow" | "red";
export type CriterionStatus = "pass" | "warn" | "fail" | "not_found";
export type NdaType = "mutual" | "unilateral_disclosing" | "unilateral_receiving" | "unknown";

export interface PlaybookAssessment {
  verdict:
    | "meets_standard"
    | "within_acceptable_range"
    | "outside_range"
    | "deal_breaker_hit"
    | "not_assessed";
  playbookPosition?: string | null;
  deviationSummary?: string | null;
  triggeredEscalations?: string[];
}

export interface ScreeningCriterion {
  criterionId: number;
  criterionName: string;
  status: CriterionStatus;
  findings: string;
  issues: string[];
  recommendation?: string | null;
  playbookAssessment?: PlaybookAssessment | null;
}

export interface NdaTriageResult {
  id: string;
  classification: NdaClassification;
  summary: string;
  ndaType: NdaType;
  counterpartyName?: string | null;
  criteria: ScreeningCriterion[];
  passCount: number;
  warnCount: number;
  failCount: number;
  keyIssues: string[];
  routingRecommendation: string;
  estimatedTimeline?: string | null;
  missingCarveouts: string[];
  problematicProvisions: string[];
  parseWarning?: string | null;
  /** RED when a playbook deal-breaker fires even if the AI said GREEN/YELLOW.
   *  Equal to `classification` when no playbook is configured. Prefer this. */
  effectiveClassification?: NdaClassification | null;
}

/** Screen a full NDA. Jurisdiction is fixed to US (US-only product). */
export async function triageNda(
  args: { documentText: string; counterpartyName?: string; businessContext?: string },
  signal?: AbortSignal,
): Promise<NdaTriageResult> {
  return request<NdaTriageResult>(NDA_TRIAGE, {
    method: "POST",
    body: {
      documentText: args.documentText,
      counterpartyName: args.counterpartyName || undefined,
      businessContext: args.businessContext || undefined,
      jurisdiction: "US",
    },
    signal,
  });
}
