import { Badge } from "@/ui/primitives";
import type { GuidelineResult } from "@/api/guidelines";
import { verdictLabel, verdictTone } from "./status";

/**
 * One guideline in the custom checklist: its verdict pill, the guideline
 * question, the plain-English explanation, and the grounded proving quote. The
 * quote is the differentiator: it is a passage copied verbatim from the document
 * (verified server-side). When it is blank, we say so explicitly rather than
 * implying a citation that does not exist.
 */
export function GuidelineCard({ result }: { result: GuidelineResult }) {
  return (
    <div className="req-card">
      <div className="req-card__head">
        <Badge tone={verdictTone(result.verdict)}>{verdictLabel(result.verdict)}</Badge>
      </div>

      {result.guideline && <p className="req-card__name">{result.guideline}</p>}
      {result.explanation && <p className="small">{result.explanation}</p>}

      {result.quote ? (
        <blockquote className="guideline-card__quote">{result.quote}</blockquote>
      ) : (
        <p className="guideline-card__ungrounded small muted">Not grounded in the document.</p>
      )}
    </div>
  );
}
