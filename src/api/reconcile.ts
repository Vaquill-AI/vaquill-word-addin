import { request } from "./http";

/**
 * Adapt a borrowed clause's defined terms + cross-references to the open
 * (destination) document, for the clause-transplant flow. Returns the reconciled
 * clause text plus a transparent list of the term/reference changes.
 *
 * Backend: POST /api/v1/drafting/reconcile-terms (camelCase; change items use
 * the raw `from` / `to` keys).
 */
export interface TermChange {
  from: string;
  to: string;
  note: string;
}

export interface Reconciliation {
  reconciledText: string;
  changes: TermChange[];
}

export async function reconcileTerms(
  clauseText: string,
  destinationText: string,
): Promise<Reconciliation> {
  return request<Reconciliation>("/api/v1/drafting/reconcile-terms", {
    method: "POST",
    body: { clauseText, destinationText },
  });
}
