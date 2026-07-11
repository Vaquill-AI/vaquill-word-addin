import { useCallback, useEffect, useRef, useState } from "react";
import {
  streamContractReview,
  MAX_DOCUMENT_CHARS,
  type ReviewProgress,
} from "@/api/contract-review";
import type { ContractReviewResponse } from "@/api/types";
import { readDocumentText, readFullDocumentText, readSelectionText } from "@/office/document";
import { ApiError, friendlyMessage } from "@/api/errors";
import { sha256Hex } from "@/lib/hash";
import { splitIntoSections, mergeReviews } from "@/lib/sections";
import type { ReviewScope } from "./constants";

export type ReviewStatus = "idle" | "reading" | "streaming" | "done" | "error";

// Section size leaves headroom under the hard cap; a document over this many
// sections is refused rather than fanning out into a very large, slow, costly
// run (each section is a separate billed review pass).
const SECTION_CHARS = MAX_DOCUMENT_CHARS - 5_000;
const MAX_SECTIONS = 8;

export interface RunParams {
  contractType: string;
  userSide: string;
  jurisdiction: string;
  scope: ReviewScope;
  playbookId?: string;
  reviewInstructions?: string;
  /** Include footnotes and headers/footers in the whole-document read. */
  includeExtras?: boolean;
  /** Scope this review to a Vaquill AI matter (carried through to saving). */
  matterId?: string;
}

export interface ReviewState {
  status: ReviewStatus;
  progress: ReviewProgress | null;
  result: ContractReviewResponse | null;
  error: string | null;
  /** SHA-256 of the reviewed document body, the freshness baseline. */
  docHash: string | null;
  /** Set when a sectioned review finished only some sections (the rest failed),
   * so the completed, billed work is not thrown away. */
  partial: { done: number; total: number } | null;
}

const INITIAL: ReviewState = {
  status: "idle",
  progress: null,
  result: null,
  error: null,
  docHash: null,
  partial: null,
};

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
  const hydrate = useCallback((result: ContractReviewResponse, docHash?: string) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({
      status: "done",
      progress: null,
      result,
      error: null,
      docHash: docHash ?? null,
      partial: null,
    });
  }, []);

  const run = useCallback(async (params: RunParams) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ status: "reading", progress: null, result: null, error: null, docHash: null, partial: null });
    // Track the terminal payload so a dropped trailing "done" frame (proxies can
    // buffer and drop it) does not overwrite a finished, billed review with a
    // truncation error. Declared outside try so the catch can see it.
    let delivered: ContractReviewResponse | null = null;
    try {
      const documentText =
        params.scope === "selection"
          ? await readSelectionText()
          : params.includeExtras
            ? await readFullDocumentText()
            : await readDocumentText();

      if (!documentText.trim()) {
        setState({
          status: "error",
          progress: null,
          result: null,
          docHash: null,
          partial: null,
          error:
            params.scope === "selection"
              ? "Select the clause or section you want reviewed first."
              : "No readable text found in this document. If it is a scanned image, it needs to be converted to text (OCR) before it can be reviewed.",
        });
        return;
      }

      const docHash = await sha256Hex(documentText);
      const base = {
        contractType: params.contractType,
        userSide: params.userSide,
        // Top-level jurisdiction is the country code (US). The chosen US state
        // travels in dealContext.governingLaw; putting a state name in
        // `jurisdiction` 422s (backend pattern ^([A-Z]{2}|INTL)$).
        jurisdiction: "US",
        dealContext: params.jurisdiction ? { governingLaw: params.jurisdiction } : undefined,
        playbookId: params.playbookId,
        reviewInstructions: params.reviewInstructions || undefined,
        matterId: params.matterId || undefined,
      };

      setState((s) => ({ ...s, status: "streaming", docHash }));

      // ---- Small enough for a single pass ----
      if (documentText.length <= MAX_DOCUMENT_CHARS) {
        await streamContractReview(
          { documentText, ...base },
          {
            signal: controller.signal,
            onProgress: (progress) => setState((s) => ({ ...s, progress })),
            onResult: (result) => {
              delivered = result;
              setState((s) => ({ ...s, status: "done", result, progress: null }));
            },
          },
        );
        return;
      }

      // ---- Too long: review contiguous sections and merge ----
      const sections = splitIntoSections(documentText, SECTION_CHARS);
      if (sections.length > MAX_SECTIONS) {
        setState({
          status: "error",
          progress: null,
          result: null,
          docHash: null,
          partial: null,
          error:
            "This document is very large. Review it in parts: select a section in Word, then run the review on the selection.",
        });
        return;
      }

      const parts: ContractReviewResponse[] = [];
      let sectionError: Error | null = null;
      for (let i = 0; i < sections.length; i++) {
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          progress: { step: i + 1, total: sections.length, label: `Reviewing section ${i + 1} of ${sections.length}...` },
        }));
        let sectionResult: ContractReviewResponse | null = null;
        try {
          await streamContractReview(
            { documentText: sections[i], ...base },
            {
              signal: controller.signal,
              onProgress: (progress) =>
                setState((s) => ({
                  ...s,
                  progress: {
                    ...progress,
                    label: `Section ${i + 1}/${sections.length}: ${progress.label ?? "reviewing"}`,
                  },
                })),
              onResult: (result) => {
                sectionResult = result;
              },
            },
          );
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
          // Tolerate a dropped trailing frame if the section result arrived.
          if (!sectionResult) {
            // Keep the sections we already completed rather than discarding
            // billed work; stop here and report a partial review.
            sectionError = e as Error;
            break;
          }
        }
        if (sectionResult) parts.push(sectionResult);
      }

      // Nothing completed at all: surface the failure.
      if (parts.length === 0) throw sectionError ?? new Error("The review returned no results.");

      const merged = mergeReviews(parts);
      delivered = merged;
      const partial = sectionError ? { done: parts.length, total: sections.length } : null;
      setState((s) => ({ ...s, status: "done", result: merged, progress: null, partial }));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (delivered) {
        setState((s) => ({ ...s, status: "done", progress: null, result: delivered, error: null }));
        return;
      }
      const error = e instanceof ApiError ? friendlyMessage(e) : (e as Error).message;
      setState((s) => ({ ...s, status: "error", progress: null, result: null, error }));
    }
  }, []);

  // Abort any in-flight review when the view unmounts (tab switch), so a paid
  // server-side review is not left running with no consumer.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, run, reset, hydrate };
}
