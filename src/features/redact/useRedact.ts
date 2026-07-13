import { useCallback, useState } from "react";
import { errorMessage } from "@/api/errors";
import { detectEntities } from "@/api/redact";
import { readFullDocumentText, readSelectionText } from "@/office/document";
import { redactValues, type RedactScope } from "@/office/redact";
import { CATEGORIES } from "./categories";
import { mergeAiEntities, scanText, type RedactCandidate } from "./detect";

const MIN_CHARS = 20;

export type RedactState =
  | { status: "idle" }
  | { status: "scanning" }
  | {
      status: "review";
      /** Which surface was scanned; the redact pass reuses it. */
      scope: RedactScope;
      candidates: RedactCandidate[];
      confirmed: ReadonlySet<string>;
      /** True while the optional AI entity pass is still running. */
      aiPending?: boolean;
    }
  | { status: "applying"; done: number; total: number }
  | { status: "done"; redacted: number; notFound: string[] }
  | { status: "error"; error: string };

/**
 * Scan the document for sensitive values in the chosen categories, let the user
 * confirm which to redact, then apply true removal with a progress counter.
 */
export function useRedact() {
  const [state, setState] = useState<RedactState>({ status: "idle" });

  const scan = useCallback(async (categories: ReadonlySet<string>, scope: RedactScope = "document") => {
    if (categories.size === 0) return;
    setState({ status: "scanning" });
    try {
      // Selection scope reads only the highlighted text; document scope reads
      // the whole body. A collapsed cursor reads as empty, so guard the user
      // toward selecting something rather than silently scanning the whole doc.
      const text = scope === "selection" ? await readSelectionText() : await readFullDocumentText();
      if (scope === "selection") {
        if (text.trim().length === 0) {
          setState({
            status: "error",
            error: "Select some text first, or switch to whole document.",
          });
          return;
        }
      } else if (text.trim().length < MIN_CHARS) {
        setState({ status: "error", error: "This document has no text to scan yet." });
        return;
      }
      // Synchronous regex pass: show these results immediately.
      const candidates = scanText(text, categories);
      // Default every found value to confirmed; the user unchecks to keep one.
      const aiSelected = CATEGORIES.some((c) => c.ai && categories.has(c.key));
      setState({
        status: "review",
        scope,
        candidates,
        confirmed: new Set(candidates.map((c) => c.text)),
        aiPending: aiSelected,
      });
      if (!aiSelected) return;

      // Optional AI pass: merge named entities in. detectEntities returns []
      // on any failure, so the regex results already shown always survive.
      const entities = await detectEntities(text);
      setState((s) => {
        if (s.status !== "review") return s; // User navigated away.
        const merged = mergeAiEntities(s.candidates, entities, text, categories);
        // Auto-confirm the newly added AI candidates (same default as regex),
        // while preserving any toggles the user made while the pass ran.
        const known = new Set(s.candidates.map((c) => c.text));
        const confirmed = new Set(s.confirmed);
        for (const c of merged) {
          if (!known.has(c.text)) confirmed.add(c.text);
        }
        return { status: "review", scope: s.scope, candidates: merged, confirmed, aiPending: false };
      });
    } catch (e) {
      setState({ status: "error", error: errorMessage(e) });
    }
  }, []);

  const setConfirmed = useCallback((confirmed: ReadonlySet<string>) => {
    setState((s) => (s.status === "review" ? { ...s, confirmed } : s));
  }, []);

  const apply = useCallback(async (values: string[], scope: RedactScope = "document") => {
    const list = [...new Set(values)];
    setState({ status: "applying", done: 0, total: list.length });
    if (list.length === 0) {
      setState({ status: "done", redacted: 0, notFound: [] });
      return;
    }
    try {
      const outcome = await redactValues(list, {
        scope,
        onProgress: (done, total) => setState({ status: "applying", done, total }),
      });
      setState({ status: "done", redacted: outcome.redacted, notFound: outcome.notFound });
    } catch (e) {
      setState({ status: "error", error: errorMessage(e) });
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, scan, setConfirmed, apply, reset };
}
