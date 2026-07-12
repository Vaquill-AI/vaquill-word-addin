import { useCallback, useRef, useState } from "react";
import { triageNda, type NdaTriageResult } from "@/api/nda-triage";
import { readFullDocumentText } from "@/office/document";
import { ApiError, friendlyMessage } from "@/api/errors";

/** Backend requires documentText >= 100 chars; guard before the network call. */
const MIN_CHARS = 100;

export type NdaTriageState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: NdaTriageResult }
  | { status: "error"; error: string };

/**
 * Runs a whole-document NDA triage. Reads the full document text from Word,
 * guards the minimum length, and surfaces a friendly error rather than throwing.
 * One run at a time; `reset` returns to the form.
 */
export function useNdaTriage() {
  const [state, setState] = useState<NdaTriageState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (args: { counterpartyName?: string; businessContext?: string }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: "running" });
      try {
        const text = await readFullDocumentText();
        if (text.trim().length < MIN_CHARS) {
          setState({
            status: "error",
            error: "This document is too short to screen. Add the NDA text first.",
          });
          return;
        }
        const result = await triageNda(
          {
            documentText: text,
            counterpartyName: args.counterpartyName,
            businessContext: args.businessContext,
          },
          controller.signal,
        );
        setState({ status: "done", result });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setState({
          status: "error",
          error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
        });
      }
    },
    [],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ status: "idle" });
  }, []);

  return { state, run, reset };
}
