import { useCallback, useState } from "react";
import { checkCompliance, type ComplianceResult } from "@/api/clause-tools";
import { readStructuredDocumentText } from "@/office/document";
import { ApiError, friendlyMessage } from "@/api/errors";

/** Backend requires documentText >= 100 chars; guard before the network call. */
const MIN_CHARS = 100;

export type ComplianceState =
  | { status: "idle" }
  | { status: "running"; regulation: string }
  | { status: "done"; regulation: string; result: ComplianceResult }
  | { status: "error"; error: string };

/**
 * Runs a whole-document compliance check against a chosen regulation. Reads the
 * full document text from Word, guards the minimum length, and surfaces a
 * friendly error rather than throwing. One check at a time; `reset` returns to
 * the picker.
 */
export function useCompliance() {
  const [state, setState] = useState<ComplianceState>({ status: "idle" });

  const run = useCallback(async (regulation: string) => {
    setState({ status: "running", regulation });
    try {
      const text = await readStructuredDocumentText();
      if (text.trim().length < MIN_CHARS) {
        setState({
          status: "error",
          error: "This document is too short to check. Add the contract text first.",
        });
        return;
      }
      const result = await checkCompliance(text, regulation, "other");
      setState({ status: "done", regulation, result });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
      });
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, run, reset };
}
