import { Badge } from "@/ui/primitives";
import type { Grounding } from "@/api/types";

/**
 * Grounding is Vaquill AI's transparency signal, surfaced where competitors
 * hide it: whether the cited clause was confirmed verbatim in the source.
 */
export function GroundingBadge({ grounding }: { grounding: Grounding }) {
  switch (grounding) {
    case "verified":
      return <Badge tone="green">Verified</Badge>;
    case "insertion":
      return <Badge tone="brand">New clause</Badge>;
    default:
      return <Badge tone="yellow">Verify manually</Badge>;
  }
}
