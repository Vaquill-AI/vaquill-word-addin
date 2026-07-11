import { useCallback, useEffect, useState } from "react";
import { readLedger, writeLedger } from "@/office/governance";
import {
  applySignoff,
  checkIntegrity,
  type GovernanceLedger,
  type IntegrityState,
} from "@/lib/governance";
import {
  InsufficientAuthorityError,
  recordDraftApproval,
  type ApprovalDecisionRecord,
} from "@/api/approvals";
import { getUser } from "@/auth/session";

export type { IntegrityState };
export type LoadStatus = "loading" | "none" | "loaded" | "error";

export interface GovernanceState {
  status: LoadStatus;
  ledger: GovernanceLedger | null;
  integrity: IntegrityState;
  error: string | null;
  busy: boolean;
}

const INITIAL: GovernanceState = {
  status: "loading",
  ledger: null,
  integrity: "unknown",
  error: null,
  busy: false,
};

function actor(): string {
  return getUser()?.email ?? "Unknown user";
}

/** Reads the governance ledger from the open document and drives sign-off. */
export function useGovernance() {
  const [state, setState] = useState<GovernanceState>(INITIAL);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const ledger = await readLedger();
      if (!ledger) {
        setState({ ...INITIAL, status: "none" });
        return;
      }
      const integrity = await checkIntegrity(ledger);
      setState({
        status: "loaded",
        ledger,
        integrity,
        error: null,
        busy: false,
      });
    } catch (e) {
      setState({ ...INITIAL, status: "error", error: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signOff = useCallback(
    async (note?: string) => {
      const ledger = state.ledger;
      if (!ledger) return;
      setState((s) => ({ ...s, busy: true, error: null }));
      try {
        const draftId = ledger.draftId;
        const level = ledger.requiredLevel;

        // Enforced path: when the reviewed contract was saved to Vaquill AI
        // (draft id present) and a level is required, run the sign-off through
        // the backend's authority-enforced approval. A 403 is a HARD block, and
        // the server returns the verified role we stamp into the ledger.
        if (draftId && level) {
          try {
            const record: ApprovalDecisionRecord = await recordDraftApproval({
              draftId,
              approvalLevel: level,
              decision: "approved",
              rationale: note,
              verdictSnapshot: {
                source: "word_addin",
                requiredLevel: level,
                dealBreakerCount: ledger.dealBreakerCount,
                summary: ledger.summary,
                reasons: ledger.reasons,
              },
            });
            const next = await applySignoff(ledger, actor(), note, {
              enforced: true,
              role: record.decidedByRole ?? null,
            });
            await writeLedger(next);
            setState({ status: "loaded", ledger: next, integrity: "verified", error: null, busy: false });
          } catch (e) {
            if (e instanceof InsufficientAuthorityError) {
              // Insufficient authority: hard block, do not attest.
              setState((s) => ({ ...s, busy: false, error: e.message }));
              return;
            }
            // Network / server error: surface it and let the user retry rather
            // than silently downgrading an enforced sign-off to an attestation.
            setState((s) => ({ ...s, busy: false, error: (e as Error).message }));
          }
          return;
        }

        // Attestation fallback: no saved draft, so record the in-file
        // (tamper-evident, authority-UNverified) attestation, unchanged.
        const next = await applySignoff(ledger, actor(), note, { enforced: false });
        await writeLedger(next);
        setState({ status: "loaded", ledger: next, integrity: "verified", error: null, busy: false });
      } catch (e) {
        setState((s) => ({ ...s, busy: false, error: (e as Error).message }));
      }
    },
    [state.ledger],
  );

  return { state, load, signOff };
}
