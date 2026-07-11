import { request } from "./http";

/**
 * Selection-scoped clause + analysis tools.
 *
 * Two backends are used here:
 *  - Drafting clause tools: POST /api/v1/drafting/clause/{rewrite,explain}.
 *    These request bodies use snake_case keys (the backend models set
 *    serialization_alias only, so camelCase is output-only; input is by field
 *    name). Responses come back camelCase.
 *  - Legal tools: POST /api/v1/legal-tools/{plain-english,risk-assessment,
 *    compliance-check}. These accept camelCase input (validation_alias) and
 *    return camelCase (serialization_alias).
 *
 * All new response fields are optional and null-guarded: the UI must never
 * crash when a field is absent.
 */

// ---------------------------------------------------------------------------
// Rewrite (G4): mode + tone controls, provenance-gated apply
// ---------------------------------------------------------------------------

export type RewriteMode = "rewrite" | "simplify" | "formalize";
export type RewriteTone = "protective" | "balanced" | "permissive";

/** Provenance for a rewritten clause. All optional; absent on older servers. */
export interface RewriteProvenance {
  /** 'system' | 'corpus' | 'user' | 'generated' | 'tier_b_rewrite'. */
  source?: string;
  /** 1.0 = fully grounded, <1.0 = AI-generated. */
  confidence?: number;
  reviewRequired?: boolean;
  playbookMatch?: string | null;
}

export interface RewriteResult {
  original: string;
  rewritten: string;
  changesSummary: string;
  provenance?: RewriteProvenance;
}

export interface ExplainResult {
  explanation: string;
  keyObligations: string[];
  risks: string[];
  applicableActs: string[];
}

// ---------------------------------------------------------------------------
// Risk assessment (G3): 5x5 severity-by-likelihood matrix
// ---------------------------------------------------------------------------

export interface RiskFactor {
  name?: string;
  description?: string;
  impact?: string;
  isMitigating?: boolean;
}

export interface MitigationOption {
  description?: string;
  effectiveness?: string;
  effort?: string;
  recommended?: boolean;
}

export interface EscalationRecommendation {
  escalateTo?: string;
  urgency?: string;
  reason?: string;
  outsideCounselRecommended?: boolean;
}

export interface RiskResult {
  id?: string;
  summary?: string;
  /** 'green' | 'yellow' | 'orange' | 'red'. */
  riskLevel?: string;
  riskScore?: number;
  severity?: string;
  severityValue?: number;
  severityRationale?: string;
  likelihood?: string;
  likelihoodValue?: number;
  likelihoodRationale?: string;
  riskCategory?: string;
  riskDescription?: string;
  contributingFactors?: RiskFactor[];
  mitigatingFactors?: RiskFactor[];
  mitigationOptions?: MitigationOption[];
  escalation?: EscalationRecommendation | null;
  residualRisk?: string | null;
  monitoringPlan?: string | null;
  parseWarning?: string | null;
}

// ---------------------------------------------------------------------------
// Compliance check (G3): per-requirement checklist against a regulation
// ---------------------------------------------------------------------------

export type ComplianceStatusValue =
  | "compliant"
  | "partially_compliant"
  | "non_compliant"
  | "not_applicable";

export interface ComplianceRequirement {
  requirementId?: string;
  requirementName?: string;
  regulationReference?: string;
  status?: ComplianceStatusValue;
  findings?: string;
  gapDescription?: string | null;
  recommendation?: string | null;
  priority?: string;
}

export interface ComplianceGap {
  gapName?: string;
  description?: string;
  regulationReference?: string;
  riskLevel?: string;
  remediation?: string;
}

export interface ComplianceResult {
  id?: string;
  overallStatus?: ComplianceStatusValue;
  complianceScore?: number;
  summary?: string;
  regulationType?: string;
  requirements?: ComplianceRequirement[];
  compliantCount?: number;
  partiallyCompliantCount?: number;
  nonCompliantCount?: number;
  notApplicableCount?: number;
  gaps?: ComplianceGap[];
  responseTimeline?: string | null;
  parseWarning?: string | null;
}

const REWRITE = "/api/v1/drafting/clause/rewrite";
const EXPLAIN = "/api/v1/drafting/clause/explain";
const PLAIN_ENGLISH = "/api/v1/legal-tools/plain-english";
const RISK = "/api/v1/legal-tools/risk-assessment";
const COMPLIANCE = "/api/v1/legal-tools/compliance-check";

export interface RewriteOptions {
  instruction?: string;
  mode?: RewriteMode;
  tone?: RewriteTone;
  jurisdiction?: string;
}

export async function rewriteClause(
  clauseText: string,
  opts: RewriteOptions = {},
): Promise<RewriteResult> {
  // Drafting endpoint reads snake_case field names on input.
  const body: Record<string, unknown> = {
    clause_text: clauseText,
    instruction: opts.instruction || "Rewrite for clarity and legal precision",
    jurisdiction: opts.jurisdiction ?? "US",
    mode: opts.mode ?? "rewrite",
    tone: opts.tone ?? "balanced",
  };
  return request(REWRITE, { method: "POST", body });
}

export async function explainClause(clauseText: string, jurisdiction = "US"): Promise<ExplainResult> {
  return request(EXPLAIN, {
    method: "POST",
    body: { clause_text: clauseText, jurisdiction },
  });
}

/** Plain-English summary of the selected text (legal-tools endpoint). */
export async function plainEnglish(text: string): Promise<{ explanation: string }> {
  return request(PLAIN_ENGLISH, { method: "POST", body: { text } });
}

/** 5x5 risk assessment of the selected text (legal-tools endpoint). */
export async function assessRisk(
  documentText: string,
  riskCategory = "contract",
): Promise<RiskResult> {
  return request(RISK, {
    method: "POST",
    body: { documentText, riskCategory },
  });
}

/** Compliance check of the selected text against a regulation (legal-tools endpoint). */
export async function checkCompliance(
  documentText: string,
  regulationType: string,
  documentCategory = "other",
): Promise<ComplianceResult> {
  return request(COMPLIANCE, {
    method: "POST",
    body: { documentText, regulationType, documentCategory },
  });
}
