/**
 * TypeScript mirrors of the Vaquill backend schemas the add-in consumes.
 * Field names are the camelCase serialization aliases the API emits.
 * Source of truth: app/models/legal_tools_schemas.py in the backend repo.
 */

export type Grounding = "verified" | "unverified" | "insertion";
export type ApprovalLevel = "none" | "manager" | "partner" | "gc";
export type OverallRisk = "green" | "yellow" | "red" | string;
/** Backend DeviationSeverity enum, serialized as its lowercase value. */
export type Severity = "green" | "yellow" | "red" | string;

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

/**
 * A substantive observation the reviewer noticed but deliberately did NOT turn
 * into a redline (a wrong entity name, an odd schedule entry, a genuine
 * ambiguity). Surfaced as a "flag for discussion" for a human to confirm
 * before signing. Optional and additive: absent when the model emits none.
 */
export interface ReviewFlag {
  clauseName: string;
  sectionReference?: string;
  observation: string;
}

/** Analysis of a single contract clause (loosely rendered by the MVP). */
export interface ClauseAnalysis {
  clauseName: string;
  clauseType?: string;
  sectionReference?: string | null;
  currentLanguage?: string;
  severity?: Severity;
  analysis?: string;
  riskDescription?: string | null;
  playbookPosition?: string | null;
  approvalLevel?: ApprovalLevel | null;
  isDealBreaker?: boolean;
}

/**
 * Lightweight fingerprint of a known counterparty paper (AWS Customer
 * Agreement, Salesforce MSA, etc.) detected in the reviewed contract. Present
 * only when the AI layered counterparty-specific redlines on the findings.
 */
export interface CounterpartyMatch {
  slug: string;
  name: string;
  vendor: string;
  /** rigid | limited | standard - how negotiable this paper is. */
  flexibility?: string;
  negotiationStrategyNote?: string;
  matchedPhrases?: string[];
  counterpartyRedlinesCount?: number;
}

/**
 * The reviewer's liability exposure at a glance, computed from their side:
 * cap status + amount + grounded quote, uncapped carve-outs, mutuality,
 * consequential-damages waiver, indemnity. Null when the contract has no
 * liability/indemnity terms. Every field is null-guarded (dirty LLM data).
 */
export interface LiabilityExposure {
  exposureLevel?: Severity;
  verdict?: string;
  /** capped | uncapped | partial | not_addressed */
  capStatus?: string | null;
  capAmount?: string | null;
  /** Verbatim contract sentence the cap claim is drawn from. */
  capQuote?: string | null;
  /** 'verified' when capQuote is a literal span of the contract. */
  grounding?: string | null;
  /** per_claim | aggregate | both | unclear */
  capScope?: string | null;
  capAdequate?: boolean | null;
  mutualCap?: boolean | null;
  consequentialDamagesExcluded?: boolean | null;
  /** Obligations that escape the cap (unlimited-liability exposure). */
  uncappedCarveouts?: string[];
  supercap?: string | null;
  indemnityExposure?: string | null;
  insuranceRequired?: string | null;
  claimTimeBar?: string | null;
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
  clauses?: ClauseAnalysis[];
  liabilityExposure?: LiabilityExposure | null;
  counterpartyMatch?: CounterpartyMatch | null;
  /** "Flag for discussion" items: noticed but not redlined. */
  flags?: ReviewFlag[];
}

export interface ContractReviewRequest {
  documentText: string;
  contractType: string;
  userSide: string;
  /** ISO-2 country code only (backend pattern ^([A-Z]{2}|INTL)$). US states go
   *  in dealContext.governingLaw, NOT here. */
  jurisdiction: string;
  /** Optional deal attributes conditional escalation rules evaluate. The
   *  governing-law state (e.g. "CA", "NY", "DE") lives here. */
  dealContext?: { governingLaw?: string };
  playbookId?: string;
  reviewInstructions?: string;
  matterId?: string;
  /** Markup aggressiveness: 'light' flags only escalation triggers, 'standard'
   *  marks gaps to the preferred position, 'firm' hard-lines every deviation. */
  markupLevel?: "light" | "standard" | "firm";
  /** Whose paper: 'own' = defend our template, 'counterparty' = mark up their
   *  form assertively. Orthogonal to userSide. Omit if unknown. */
  paperSide?: "own" | "counterparty";
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
