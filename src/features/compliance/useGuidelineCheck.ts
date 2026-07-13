import { useCallback, useState } from "react";
import { checkGuidelines, type GuidelineResult } from "@/api/guidelines";
import { readStructuredDocumentText } from "@/office/document";
import { errorMessage } from "@/api/errors";

/** Backend requires a non-trivial document; guard before the network call. */
const MIN_CHARS = 100;

/**
 * Sensible starter checklist for a commercial contract review. Users edit these
 * (one per line) before running. Kept plain-English and side-agnostic so they
 * read as reviewer prompts, not legal advice.
 */
export const DEFAULT_GUIDELINES: string[] = [
  "Are payment terms net 30 or better?",
  "Is liability capped, and is the cap reasonable?",
  "Is there a mutual confidentiality obligation?",
  "Can either party terminate for convenience with notice?",
  "Is the governing law a US state?",
];

export type GuidelineState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; results: GuidelineResult[] }
  | { status: "error"; error: string };

/**
 * Runs a custom guideline checklist against the whole document. Reads the full
 * document text from Word, guards the minimum length, and surfaces a friendly
 * error rather than throwing. One run at a time; `reset` returns to the editor.
 */
export function useGuidelineCheck() {
  const [state, setState] = useState<GuidelineState>({ status: "idle" });

  const run = useCallback(async (guidelines: string[]) => {
    const cleaned = guidelines.map((g) => g.trim()).filter((g) => g.length > 0);
    if (cleaned.length === 0) {
      setState({ status: "error", error: "Add at least one guideline to check." });
      return;
    }
    setState({ status: "running" });
    try {
      const text = await readStructuredDocumentText();
      if (text.trim().length < MIN_CHARS) {
        setState({
          status: "error",
          error: "This document is too short to check. Add the contract text first.",
        });
        return;
      }
      const results = await checkGuidelines(text, cleaned);
      setState({ status: "done", results });
    } catch (e) {
      setState({
        status: "error",
        error: errorMessage(e),
      });
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, run, reset };
}
