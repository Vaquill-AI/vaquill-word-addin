import { useCallback, useEffect, useRef, useState } from "react";
import { locateInDocument, locateOccurrence } from "@/office/navigate";

/**
 * Shared "step through every occurrence" behavior for any surface that shows a
 * count next to a locate button ("N uses", "Referenced N times", ...). Each call
 * to `cycle` jumps to the NEXT occurrence of the text (wrapping around), so
 * repeated clicks walk all of them instead of parking on the first.
 *
 * Two read helpers keep the display honest and in sync with what is navigable:
 *  - `labelFor(key)` -> the transient "k of N" to show right after a click
 *    (auto-clears), or null.
 *  - `countFor(key)` -> the ACTUAL navigable occurrence count once known, so the
 *    badge can reconcile to it (equals the analyzer count when the caller passes
 *    the same plural `variants` the analyzer uses).
 *
 * `key` defaults to the search text; pass a distinct key when the display text
 * and the search text differ.
 */
export function useOccurrenceCycler() {
  const idxRef = useRef<Map<string, number>>(new Map());
  const countRef = useRef<Map<string, number>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [pos, setPos] = useState<{ key: string; label: string } | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const cycle = useCallback(
    async (text: string, opts?: { key?: string; variants?: readonly string[] }) => {
      const key = opts?.key ?? text;
      const next = (idxRef.current.get(key) ?? -1) + 1;
      const { count, index } = await locateOccurrence(text, next, { variants: opts?.variants });
      if (count === 0) {
        // No exact match (unusual): best-effort jump so the button is never dead.
        await locateInDocument(text);
        return;
      }
      idxRef.current.set(key, index);
      countRef.current.set(key, count);
      setPos({ key, label: `${index + 1} of ${count}` });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPos(null), 2600);
    },
    [],
  );

  const labelFor = useCallback((key: string) => (pos?.key === key ? pos.label : null), [pos]);
  // Reads a ref: only meaningful in a render triggered by a cycle (setPos), which
  // is exactly when the badge needs to reconcile, so no extra state is needed.
  const countFor = useCallback((key: string) => countRef.current.get(key), []);

  return { cycle, labelFor, countFor };
}
