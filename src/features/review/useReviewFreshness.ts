import { useCallback, useEffect, useRef, useState } from "react";
import { readDocumentFingerprint } from "@/office/document";
import { onDocumentChanged } from "@/office/changeEvents";

/**
 * Tells whether the document changed since the review whose body hash is
 * `baseline`. Driven by Word's real content-change events (onParagraphChanged /
 * Added / Deleted), with a fallback to selection changes on hosts that lack
 * them. On a change it re-fingerprints the body, debounced so a large document
 * is not re-read on every keystroke. When `baseline` is null it does nothing.
 */
export function useReviewFreshness(baseline: string | null) {
  const [stale, setStale] = useState(false);
  const baseRef = useRef(baseline);
  baseRef.current = baseline;

  const check = useCallback(async () => {
    const b = baseRef.current;
    if (!b) return;
    try {
      const current = await readDocumentFingerprint();
      setStale(current !== b);
    } catch {
      // If we cannot read the document, leave the last known freshness as-is.
    }
  }, []);

  useEffect(() => {
    setStale(false);
    if (!baseline) return;

    let cancelled = false;
    let unsub: (() => void) | null = null;
    let timer: number | undefined;
    const debounced = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void check(), 800);
    };

    onDocumentChanged(debounced)
      .then((fn) => {
        if (cancelled) fn();
        else unsub = fn;
      })
      .catch(() => {});

    void check(); // baseline just set: confirm we start fresh

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsub?.();
    };
  }, [baseline, check]);

  return { stale, recheck: check };
}
