import { request } from "./http";
import { ApiError } from "./errors";

/**
 * Backend-enforced sign-off (Tier 3.10 approval workflow).
 *
 * Endpoint: POST /api/v1/drafting/drafts/{draftId}/approvals
 *
 * Unlike the in-file governance ledger (which is a tamper-EVIDENT attestation
 * that does not check the signer's authority), this endpoint resolves the
 * caller's authority on the server (draft owner / org owner -> gc, org member
 * -> manager) and REJECTS the decision with 403 when the caller's rank is below
 * the required approval level. A 403 is therefore a hard, visible block, and the
 * 201 response carries the server-verified `decidedByRole`.
 *
 * Only usable when the reviewed contract has been saved to Vaquill AI (which
 * yields a draft id). Without a draft id, callers fall back to the in-file
 * attestation.
 */

export type ApprovalLevel = "manager" | "partner" | "gc";
export type ApprovalDecision = "approved" | "rejected" | "changes_requested";

export interface RecordApprovalInput {
  draftId: string;
  /** Authority level the decision targets (mapped from the ledger requiredLevel). */
  approvalLevel: ApprovalLevel;
  /**
   * Clause this decision applies to. A whole-document governance sign-off from
   * the add-in is recorded under a stable marker so it never collides with a
   * real playbook clause slug in the backend's pending-approval computation.
   */
  clauseType?: string;
  /** Defaults to "approved". */
  decision?: ApprovalDecision;
  sectionId?: string | null;
  rationale?: string;
  verdictSnapshot?: Record<string, unknown> | null;
}

/** Server response row (camelCase, per DraftApprovalsService._to_camel). */
export interface ApprovalDecisionRecord {
  id?: string;
  draftId?: string;
  clauseType?: string;
  sectionId?: string | null;
  approvalLevel?: string;
  decidedBy?: string;
  /** Server-verified authority the decision was recorded under. */
  decidedByRole?: string | null;
  decidedAt?: string;
  decision?: string;
  rationale?: string | null;
  verdictSnapshot?: unknown;
}

/** Marker clause type for a whole-document governance sign-off from the add-in. */
export const GOVERNANCE_SIGNOFF_CLAUSE = "governance_signoff";

/**
 * Raised when the backend rejects the decision because the caller's authority is
 * below the required approval level (HTTP 403). Callers should treat this as a
 * hard block, not a fallback-to-attestation case.
 */
export class InsufficientAuthorityError extends Error {
  readonly approvalLevel: ApprovalLevel;

  constructor(approvalLevel: ApprovalLevel, message?: string) {
    super(
      message ||
        `Your account does not have ${approvalLevel} authority to sign this off. Ask someone with the required authority to approve it in Vaquill AI.`,
    );
    this.name = "InsufficientAuthorityError";
    this.approvalLevel = approvalLevel;
  }
}

/**
 * Record an authority-enforced approval against a saved draft.
 * Throws {@link InsufficientAuthorityError} on a 403; other failures bubble as
 * the original {@link ApiError} so the caller can decide how to surface them.
 */
export async function recordDraftApproval(
  input: RecordApprovalInput,
): Promise<ApprovalDecisionRecord> {
  try {
    return await request<ApprovalDecisionRecord>(
      `/api/v1/drafting/drafts/${encodeURIComponent(input.draftId)}/approvals`,
      {
        method: "POST",
        body: {
          clauseType: input.clauseType ?? GOVERNANCE_SIGNOFF_CLAUSE,
          sectionId: input.sectionId ?? undefined,
          approvalLevel: input.approvalLevel,
          decision: input.decision ?? "approved",
          rationale: input.rationale,
          verdictSnapshot: input.verdictSnapshot ?? undefined,
        },
      },
    );
  } catch (e) {
    // kindFor(403) is "unknown" (not 5xx), so key off the status code.
    if (e instanceof ApiError && e.status === 403) {
      throw new InsufficientAuthorityError(
        input.approvalLevel,
        typeof e.message === "string" && e.message ? e.message : undefined,
      );
    }
    throw e;
  }
}
