import { Badge } from "@/ui/primitives";
import type { PlaybookFitResult } from "@/api/playbook-fit";
import type { PlaybookPosition } from "@/api/playbooks";
import { humanize } from "@/lib/strings";
import { fitVerdictLabel, fitVerdictTone } from "./status";


/**
 * Which ladder row the contract matched, derived from the verdict and the short
 * `rung` label the backend returned. Returned as a discriminated marker so the
 * ladder can highlight exactly one row:
 *  - { kind: "standard" }        -> the preferred/standard row
 *  - { kind: "fallback", index } -> a specific fallback rung (0-based)
 *  - { kind: "floor" }           -> the deal-breaker / walk-away row
 *  - { kind: "none" }            -> nothing matched (not addressed)
 */
type Match =
  | { kind: "standard" }
  | { kind: "fallback"; index: number }
  | { kind: "floor" }
  | { kind: "none" };

function resolveMatch(result: PlaybookFitResult): Match {
  switch (result.verdict) {
    case "meets_standard":
      return { kind: "standard" };
    case "below_floor":
      return { kind: "floor" };
    case "meets_fallback": {
      // Pull the 1-based fallback index out of a label like "Fallback 2".
      const m = /fallback\s*(\d+)/i.exec(result.rung);
      const n = m?.[1] ? Number.parseInt(m[1], 10) : NaN;
      return Number.isFinite(n) && n >= 1 ? { kind: "fallback", index: n - 1 } : { kind: "none" };
    }
    default:
      return { kind: "none" };
  }
}

function LadderRow({
  label,
  tone,
  text,
  matched,
}: {
  label: string;
  tone: "green" | "amber" | "red";
  text: string;
  matched: boolean;
}) {
  return (
    <div className={`fit-rung${matched ? " fit-rung--matched" : ""}`}>
      <div className="fit-rung__head">
        <span className={`fit-rung__dot fit-rung__dot--${tone}`} aria-hidden />
        <span className="fit-rung__label">{label}</span>
        {matched && <span className="fit-rung__here">contract is here</span>}
      </div>
      <p className="fit-rung__text">{text}</p>
    </div>
  );
}

/**
 * One clause in the playbook fit report: the humanized clause name, the verdict
 * pill, the matched rung label, the plain-English finding, the grounded proving
 * quote, AND the clause's full fallback ladder with the contract's matched rung
 * highlighted. Keeping the ladder visible (not just the verdict) is the point of
 * this report: the reviewer sees where the contract sits and what the next
 * acceptable step down would be.
 */
export function PlaybookFitCard({
  result,
  position,
}: {
  result: PlaybookFitResult;
  position?: PlaybookPosition;
}) {
  const match = resolveMatch(result);
  const ladder = position?.fallbackLadder ?? [];

  return (
    <div className="req-card">
      <div className="req-card__head">
        <Badge tone={fitVerdictTone(result.verdict)}>{fitVerdictLabel(result.verdict)}</Badge>
        {result.rung && <span className="fit-card__rung small muted">{result.rung}</span>}
      </div>

      <p className="req-card__name">{humanize(result.clauseType)}</p>
      {result.finding && <p className="small">{result.finding}</p>}

      {result.quote ? (
        <blockquote className="guideline-card__quote">{result.quote}</blockquote>
      ) : (
        <p className="guideline-card__ungrounded small muted">Not grounded in the document.</p>
      )}

      {position && (
        <div className="fit-ladder">
          <span className="fit-ladder__caption small muted">Fallback ladder</span>
          {position.standardPosition && (
            <LadderRow
              label="Standard"
              tone="green"
              text={position.standardPosition}
              matched={match.kind === "standard"}
            />
          )}
          {ladder.map((rung, i) => (
            <LadderRow
              key={i}
              label={`Fallback ${i + 1}`}
              tone="amber"
              text={rung}
              matched={match.kind === "fallback" && match.index === i}
            />
          ))}
          {position.dealBreaker && (
            <LadderRow
              label="Walk-away floor"
              tone="red"
              text={position.dealBreaker}
              matched={match.kind === "floor"}
            />
          )}
        </div>
      )}
    </div>
  );
}
