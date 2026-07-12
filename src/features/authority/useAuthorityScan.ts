import { useCallback, useEffect, useRef, useState } from "react";
import { readFullDocumentText } from "@/office/document";
import { getCaseStatusBatch, verifyCitation, type AuthorityResult } from "@/api/authority";
import { extractCaseCitations } from "./extract";
import { ApiError } from "@/api/errors";

export type ScanStatus = "idle" | "reading" | "scanning" | "done" | "error";

export interface ScanState {
  status: ScanStatus;
  results: AuthorityResult[];
  total: number;
  error: string | null;
  /** True while the best-effort good-law (treatment) pass is in flight. */
  checkingTreatment: boolean;
}

const INITIAL: ScanState = {
  status: "idle",
  results: [],
  total: 0,
  error: null,
  checkingTreatment: false,
};

/**
 * Scans the open document for case citations and verifies each against the
 * corpus, streaming results in as they resolve. Verification is sequential so
 * the pane populates progressively and stays within the endpoint's rate limit;
 * it stops early on a rate limit and reports what it checked.
 *
 * Uses a real AbortController so starting a new scan, resetting, or unmounting
 * cancels the in-flight lookup and stops burning the (rate-limited, billable)
 * citation-lookup quota against a component the user has left.
 */
export function useAuthorityScan() {
  const [state, setState] = useState<ScanState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL);
  }, []);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    // Best-effort good-law (treatment) pass. Runs AFTER the base verdicts are
    // rendered and merges each returned CaseStatus onto its matching result by
    // citation === raw. Never throws and never blocks the base scan: any
    // failure (or an abort) leaves results exactly as they were.
    const runTreatmentPass = async (base: AuthorityResult[]): Promise<void> => {
      const cases = base.filter((r) => r.verdict === "verified" && r.kind !== "statute");
      if (cases.length === 0 || signal.aborted) return;
      setState((prev) => ({ ...prev, checkingTreatment: true }));
      try {
        const statuses = await getCaseStatusBatch(
          cases.map((r) => r.raw),
          signal,
        );
        if (signal.aborted) return;
        const byCitation = new Map(statuses.map((s) => [s.citation, s]));
        setState((prev) => ({
          ...prev,
          checkingTreatment: false,
          results: prev.results.map((r) =>
            r.verdict === "verified" && r.kind !== "statute" && byCitation.has(r.raw)
              ? { ...r, goodLaw: byCitation.get(r.raw) }
              : r,
          ),
        }));
      } catch {
        // Additive signal only: on any failure keep the base results intact.
        if (!signal.aborted) setState((prev) => ({ ...prev, checkingTreatment: false }));
      }
    };

    setState({ ...INITIAL, status: "reading" });
    try {
      const text = await readFullDocumentText();
      if (signal.aborted) return;
      const cites = extractCaseCitations(text);
      if (cites.length === 0) {
        setState({ ...INITIAL, status: "done" });
        return;
      }

      setState({ ...INITIAL, status: "scanning", total: cites.length });
      const acc: AuthorityResult[] = [];
      for (const c of cites) {
        if (signal.aborted) return;
        try {
          acc.push(await verifyCitation(c.raw, c.count, signal));
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
          if (e instanceof ApiError && e.kind === "rate_limited") {
            setState({
              status: "done",
              results: [...acc],
              total: cites.length,
              error: "Rate limit reached. Some citations were not checked. Try again shortly.",
              checkingTreatment: false,
            });
            await runTreatmentPass(acc);
            return;
          }
          acc.push({ raw: c.raw, count: c.count, verdict: "error" });
        }
        if (signal.aborted) return;
        setState({
          status: "scanning",
          results: [...acc],
          total: cites.length,
          error: null,
          checkingTreatment: false,
        });
      }
      setState({
        status: "done",
        results: acc,
        total: cites.length,
        error: null,
        checkingTreatment: false,
      });
      await runTreatmentPass(acc);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({ ...INITIAL, status: "error", error: (e as Error).message });
    }
  }, []);

  // Cancel any in-flight scan when the tab/view unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, run, reset };
}
