import { useCallback, useEffect, useState } from "react";
import { readLedger, writeLedger } from "@/office/governance";
import {
  applySignoff,
  checkIntegrity,
  type GovernanceLedger,
  type IntegrityState,
} from "@/lib/governance";
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
      if (!state.ledger) return;
      setState((s) => ({ ...s, busy: true, error: null }));
      try {
        const next = await applySignoff(state.ledger, actor(), note);
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
