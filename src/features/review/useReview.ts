import { useCallback, useEffect, useRef, useState } from "react";
import { streamContractReview, type ReviewProgress } from "@/api/contract-review";
import type { ContractReviewResponse } from "@/api/types";
import { readDocumentText, readSelectionText } from "@/office/document";
import { ApiError, friendlyMessage } from "@/api/errors";
import type { ReviewScope } from "./constants";

export type ReviewStatus = "idle" | "reading" | "streaming" | "done" | "error";

export interface RunParams {
  contractType: string;
  userSide: string;
  jurisdiction: string;
  scope: ReviewScope;
  playbookId?: string;
  reviewInstructions?: string;
}

export interface ReviewState {
  status: ReviewStatus;
  progress: ReviewProgress | null;
  result: ContractReviewResponse | null;
  error: string | null;
}

const INITIAL: ReviewState = { status: "idle", progress: null, result: null, error: null };

/** State machine for one streamed contract review. */
export function useReview() {
  const [state, setState] = useState<ReviewState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL);
  }, []);

  /** Load a persisted review result directly into the done state (resume). */
  const hydrate = useCallback((result: ContractReviewResponse) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "done", progress: null, result, error: null });
  }, []);

  const run = useCallback(async (params: RunParams) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ status: "reading", progress: null, result: null, error: null });
    // Track the terminal payload so a dropped trailing "done" frame (proxies can
    // buffer and drop it) does not overwrite a finished, billed review with a
    // truncation error. Declared outside try so the catch can see it.
    let delivered: ContractReviewResponse | null = null;
    try {
      const documentText =
        params.scope === "selection" ? await readSelectionText() : await readDocumentText();

      if (!documentText.trim()) {
        setState({
          status: "error",
          progress: null,
          result: null,
          error:
            params.scope === "selection"
              ? "Select the clause or section you want reviewed first."
              : "This document is empty.",
        });
        return;
      }

      setState((s) => ({ ...s, status: "streaming" }));
      await streamContractReview(
        {
          documentText,
          contractType: params.contractType,
          userSide: params.userSide,
          jurisdiction: params.jurisdiction,
          playbookId: params.playbookId,
          reviewInstructions: params.reviewInstructions || undefined,
        },
        {
          signal: controller.signal,
          onProgress: (progress) => setState((s) => ({ ...s, progress })),
          onResult: (result) => {
            delivered = result;
            setState((s) => ({ ...s, status: "done", result, progress: null }));
          },
        },
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // If the review result already arrived, a later stream error is not fatal.
      if (delivered) {
        setState({ status: "done", progress: null, result: delivered, error: null });
        return;
      }
      const error = e instanceof ApiError ? friendlyMessage(e) : (e as Error).message;
      setState({ status: "error", progress: null, result: null, error });
    }
  }, []);

  // Abort any in-flight review when the view unmounts (tab switch), so a paid
  // server-side review is not left running with no consumer.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, run, reset, hydrate };
}
