import { useCallback, useEffect, useRef, useState } from "react";
import { readDocumentBlob } from "@/office/file";
import { ApiError, friendlyMessage } from "@/api/errors";
import {
  uploadCompareSource,
  sourceRefFromUpload,
  runComparison,
  getComparison,
  getRedlineDocx,
  type Comparison,
  type CompareUpload,
} from "@/api/compare";

/** Which side of the diff the open document is. Default: it is the newer version
 *  (revised), the reference is the baseline (original), so the redline reads as
 *  "what changed to arrive at the document I have open". Swappable. */
export type CompareDirection = "docIsRevised" | "docIsOriginal";

export type ComparePhase =
  | "idle"
  | "reading"
  | "uploading"
  | "queuing"
  | "processing"
  | "ready"
  | "error";

export interface CompareState {
  phase: ComparePhase;
  /** Short label for the current in-flight step. */
  step: string;
  comparison: Comparison | null;
  error: string | null;
  /** Hidden-revision warning from either uploaded side (send-back hygiene).
   *  `count` is the tracked-change count when known, 0 when the side carries
   *  only comments / hidden text. */
  hiddenRevisions: { side: "document" | "reference"; count: number } | null;
}

const INITIAL: CompareState = {
  phase: "idle",
  step: "",
  comparison: null,
  error: null,
  hiddenRevisions: null,
};

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180_000;

/** Await `ms`, rejecting immediately if the signal aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Whether an uploaded side already carries revisions, and how many tracked
 *  changes if the detector counted them (0 when only comments / hidden text). */
function hiddenInfo(u: CompareUpload): { present: boolean; count: number } {
  const hr = u.hiddenRevisions;
  if (!hr?.hasHiddenRevisions) return { present: false, count: 0 };
  return { present: true, count: hr.trackedChangeCount ?? 0 };
}

/**
 * Orchestrates one comparison: read the open document as a .docx, upload it and
 * the reference file, queue the run, and poll to completion. Cancellable; a
 * cancel aborts every in-flight fetch and the poll loop.
 */
export function useCompare() {
  const [state, setState] = useState<CompareState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => (s.phase === "ready" ? s : INITIAL));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL);
  }, []);

  const start = useCallback(
    async (reference: File, direction: CompareDirection) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const signal = controller.signal;

      const patch = (p: Partial<CompareState>) => setState((s) => ({ ...s, ...p }));
      setState({ ...INITIAL, phase: "reading", step: "Reading the open document" });

      try {
        const doc = await readDocumentBlob();
        if (signal.aborted) return;

        patch({ phase: "uploading", step: "Uploading both versions" });
        const [docUp, refUp] = await Promise.all([
          uploadCompareSource(doc.blob, doc.filename, signal),
          uploadCompareSource(reference, reference.name, signal),
        ]);
        if (signal.aborted) return;

        // Surface the more relevant hidden-revision warning (document side first).
        const docHidden = hiddenInfo(docUp);
        const refHidden = hiddenInfo(refUp);
        if (docHidden.present) patch({ hiddenRevisions: { side: "document", count: docHidden.count } });
        else if (refHidden.present) patch({ hiddenRevisions: { side: "reference", count: refHidden.count } });

        const docRef = sourceRefFromUpload(docUp);
        const refRef = sourceRefFromUpload(refUp);
        const original = direction === "docIsRevised" ? refRef : docRef;
        const revised = direction === "docIsRevised" ? docRef : refRef;

        patch({ phase: "queuing", step: "Starting the comparison" });
        const { comparisonId } = await runComparison(
          {
            original,
            revised,
            title: `Compare: ${doc.filename}`,
            authorLabel: "Vaquill Compare",
          },
          signal,
        );
        if (signal.aborted) return;

        patch({ phase: "processing", step: "Finding what changed" });
        const deadline = POLL_TIMEOUT_MS;
        let elapsed = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const c = await getComparison(comparisonId, signal);
          if (signal.aborted) return;
          if (c.status === "ready") {
            patch({ phase: "ready", step: "", comparison: c });
            return;
          }
          if (c.status === "failed") {
            patch({
              phase: "error",
              step: "",
              error: c.errorMessage || "The comparison could not be completed.",
            });
            return;
          }
          if (elapsed >= deadline) {
            patch({
              phase: "error",
              step: "",
              error: "The comparison is taking longer than expected. Please try again.",
            });
            return;
          }
          await sleep(POLL_INTERVAL_MS, signal);
          elapsed += POLL_INTERVAL_MS;
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        patch({
          phase: "error",
          step: "",
          error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
        });
      }
    },
    [],
  );

  /** Fetch the produced redline .docx (base64). Throws on failure. */
  const fetchRedline = useCallback(async (): Promise<{ base64: string; filename: string }> => {
    if (!state.comparison) throw new Error("No comparison is ready.");
    return getRedlineDocx(state.comparison.id);
  }, [state.comparison]);

  return { state, start, cancel, reset, fetchRedline };
}
