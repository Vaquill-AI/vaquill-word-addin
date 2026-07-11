import { useCallback, useEffect, useMemo, useState } from "react";
import type { RedlineSuggestion } from "@/api/types";

/** A reviewer's decision on one redline. */
export type Decision = "pending" | "accepted" | "rejected";

/**
 * Stable identity for a redline so a decision survives a reopen and does not
 * break if a re-run reorders the redlines (which an array index would). Uses the
 * clause name plus a prefix of the current language.
 */
export function redlineKey(r: { clauseName: string; currentLanguage?: string }): string {
  return `${r.clauseName}|${(r.currentLanguage ?? "").slice(0, 120)}`;
}

/**
 * Tracks per-redline decisions for the active review.
 *
 * The live map stays index-keyed (what RedlineCard / ReviewActionBar call), but
 * it is seeded from and persisted to a STABLE-id-keyed map (`persisted` /
 * `onPersist`) so reopening a reviewed .docx restores the reviewer's progress
 * instead of resetting every redline to pending.
 */
export function useDecisions(
  redlines: RedlineSuggestion[],
  resetKey: string | undefined,
  persisted?: Record<string, Decision>,
  onPersist?: (byId: Record<string, Decision>) => void,
) {
  const [map, setMap] = useState<Record<number, Decision>>({});

  // Seed the index-keyed map from the persisted stable-id map whenever the
  // review changes (new id). Guarded on resetKey so it does not re-seed on every
  // render and clobber in-session decisions.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seed only on a new review (resetKey)
  useEffect(() => {
    if (!persisted || redlines.length === 0) {
      setMap({});
      return;
    }
    const next: Record<number, Decision> = {};
    redlines.forEach((r, i) => {
      const d = persisted[redlineKey(r)];
      if (d && d !== "pending") next[i] = d;
    });
    setMap(next);
  }, [resetKey]);

  const setDecision = useCallback(
    (index: number, decision: Decision) => {
      setMap((prev) => {
        const nextMap = { ...prev, [index]: decision };
        if (onPersist) {
          const byId: Record<string, Decision> = {};
          redlines.forEach((r, i) => {
            const d = nextMap[i];
            if (d && d !== "pending") byId[redlineKey(r)] = d;
          });
          onPersist(byId);
        }
        return nextMap;
      });
    },
    [redlines, onPersist],
  );

  const decisionOf = useCallback((index: number): Decision => map[index] ?? "pending", [map]);
  const addressed = useMemo(() => Object.values(map).filter((d) => d !== "pending").length, [map]);

  return { decisionOf, setDecision, addressed };
}
