import { useCallback, useRef, useState } from "react";
import { readDocumentText } from "@/office/document";
import { verifyCitation, type AuthorityResult } from "@/api/authority";
import { extractCaseCitations } from "./extract";
import { ApiError } from "@/api/errors";

export type ScanStatus = "idle" | "reading" | "scanning" | "done" | "error";

export interface ScanState {
  status: ScanStatus;
  results: AuthorityResult[];
  total: number;
  error: string | null;
}

const INITIAL: ScanState = { status: "idle", results: [], total: 0, error: null };

/**
 * Scans the open document for case citations and verifies each against the
 * corpus, streaming results in as they resolve. Verification is sequential so
 * the pane populates progressively and stays within the endpoint's rate limit;
 * it stops early on a rate limit and reports what it checked.
 */
export function useAuthorityScan() {
  const [state, setState] = useState<ScanState>(INITIAL);
  const abortRef = useRef(false);

  const reset = useCallback(() => {
    abortRef.current = true;
    setState(INITIAL);
  }, []);

  const run = useCallback(async () => {
    abortRef.current = false;
    setState({ ...INITIAL, status: "reading" });
    try {
      const text = await readDocumentText();
      const cites = extractCaseCitations(text);
      if (cites.length === 0) {
        setState({ status: "done", results: [], total: 0, error: null });
        return;
      }

      setState({ status: "scanning", results: [], total: cites.length, error: null });
      const acc: AuthorityResult[] = [];
      for (const c of cites) {
        if (abortRef.current) return;
        try {
          acc.push(await verifyCitation(c.raw, c.count));
        } catch (e) {
          if (e instanceof ApiError && e.kind === "rate_limited") {
            setState({
              status: "done",
              results: [...acc],
              total: cites.length,
              error: "Rate limit reached. Some citations were not checked. Try again shortly.",
            });
            return;
          }
          acc.push({ raw: c.raw, count: c.count, verdict: "error" });
        }
        setState({ status: "scanning", results: [...acc], total: cites.length, error: null });
      }
      setState({ status: "done", results: acc, total: cites.length, error: null });
    } catch (e) {
      setState({ status: "error", results: [], total: 0, error: (e as Error).message });
    }
  }, []);

  return { state, run, reset };
}
