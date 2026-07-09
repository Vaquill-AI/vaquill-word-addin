import { useCallback, useRef, useState } from "react";
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

  const run = useCallback(async (params: RunParams) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ status: "reading", progress: null, result: null, error: null });
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
          onResult: (result) =>
            setState((s) => ({ ...s, status: "done", result, progress: null })),
        },
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const error = e instanceof ApiError ? friendlyMessage(e) : (e as Error).message;
      setState({ status: "error", progress: null, result: null, error });
    }
  }, []);

  return { state, run, reset };
}
