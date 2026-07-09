import { useCallback, useEffect, useState } from "react";

/** A reviewer's decision on one redline. */
export type Decision = "pending" | "accepted" | "rejected";

/**
 * Tracks per-redline decisions for the active review. Resets whenever a new
 * review (new result id) arrives, so progress and filters start clean.
 */
export function useDecisions(resetKey: string | undefined) {
  const [map, setMap] = useState<Record<number, Decision>>({});

  useEffect(() => setMap({}), [resetKey]);

  const setDecision = useCallback((index: number, decision: Decision) => {
    setMap((prev) => ({ ...prev, [index]: decision }));
  }, []);

  const decisionOf = useCallback((index: number): Decision => map[index] ?? "pending", [map]);

  const addressed = Object.values(map).filter((d) => d !== "pending").length;

  return { decisionOf, setDecision, addressed };
}
