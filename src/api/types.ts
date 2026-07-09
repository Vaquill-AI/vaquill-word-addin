/**
 * TypeScript mirrors of the Vaquill backend schemas the add-in consumes.
 * Field names are the camelCase serialization aliases the API emits.
 * Source of truth: app/models/legal_tools_schemas.py in the backend repo.
 */

export type Grounding = "verified" | "unverified" | "insertion";
export type ApprovalLevel = "none" | "manager" | "partner" | "gc";
export type OverallRisk = "green" | "yellow" | "red" | string;

/** One grounded, gated redline suggestion. */
export interface RedlineSuggestion {
  clauseName: string;
  sectionReference?: string | null;
  /** Verbatim text to anchor against in the document. */
  currentLanguage: string;
  proposedLanguage: string;
  rationale: string;
  fallbackPosition?: string | null;
  /**
   * verified   = currentLanguage is a literal substring of the source (safe to auto-apply)
   * unverified = could not be confirmed verbatim (show, do not auto-apply)
   * insertion  = a missing clause to add (no anchor; insert at a chosen location)
   */
  grounding: Grounding;
  approvalLevel?: ApprovalLevel | null;
  isDealBreaker: boolean;
}

export interface ReviewApprovalReason {
  clauseName?: string;
  level?: string;
  reason?: string;
  [k: string]: unknown;
}

/** Deterministic, server-computed sign-off gate. Never recompute client-side. */
export interface ReviewApprovalGate {
  required: boolean;
  level?: "manager" | "partner" | "gc" | null;
  dealBreakerCount: number;
  reasons: ReviewApprovalReason[];
  summary: string;
}

export interface NegotiationPriority {
  tier: number;
  tierLabel: string;
  items: string[];
}

export interface ContractReviewResponse {
  id: string;
  summary: string;
  overallRisk: OverallRisk;
  contractType?: string | null;
  userSide?: string | null;
  redlines: RedlineSuggestion[];
  negotiationPriorities: NegotiationPriority[];
  missingClauses: string[];
  businessImpactSummary?: string | null;
  approvalGate?: ReviewApprovalGate | null;
  modelUsed?: string;
  processingTimeMs?: number;
  /** Loosely typed structures the MVP does not render deeply. */
  clauses?: unknown[];
  liabilityExposure?: unknown;
  counterpartyMatch?: unknown;
}

export interface ContractReviewRequest {
  documentText: string;
  contractType: string;
  userSide: string;
  jurisdiction: string;
  playbookId?: string;
  reviewInstructions?: string;
  matterId?: string;
}

/** Accepted redline sent back for the authoritative server-generated DOCX. */
export interface AcceptedRedline {
  clauseName: string;
  currentLanguage: string;
  replacementLanguage: string;
  comment?: string;
}

export interface CorrectedContractRequest {
  documentText: string;
  acceptedRedlines: AcceptedRedline[];
  contractType: string;
  trackedChanges: boolean;
}

export interface UsageSnapshot {
  used: number;
  limit: number;
  remaining: number;
  [k: string]: unknown;
}
