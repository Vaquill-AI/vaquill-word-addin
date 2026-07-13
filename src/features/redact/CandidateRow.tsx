import type { RedactCandidate } from "./detect";

const BAR_CHAR = "█";

/** A preview bar sized to the value, matching what the redaction will insert. */
function barFor(text: string): string {
  const n = Math.max(2, Math.min(14, text.replace(/\s+/g, "").length));
  return BAR_CHAR.repeat(n);
}

/**
 * One detected value shown IN CONTEXT: the surrounding sentence with the value
 * struck through and a black-bar preview of what the redaction will insert.
 * Checked = will be redacted; unchecked keeps the value (shown plainly, no bar).
 */
export function CandidateRow({
  candidate,
  confirmed,
  onToggle,
}: {
  candidate: RedactCandidate;
  confirmed: boolean;
  onToggle: () => void;
}) {
  const ctx = candidate.context;
  return (
    <label className={`redact-row${confirmed ? "" : " redact-row--kept"}`}>
      <input type="checkbox" checked={confirmed} onChange={onToggle} />
      <div className="redact-row__body">
        <div className="redact-row__preview">
          {ctx?.before && <span className="redact-ctx">{ctx.before} </span>}
          {confirmed ? (
            <>
              <span className="redact-strike" title={candidate.text}>
                {candidate.text}
              </span>{" "}
              <span className="redact-bar" aria-hidden>
                {barFor(candidate.text)}
              </span>
            </>
          ) : (
            <span className="redact-keep" title={candidate.text}>
              {candidate.text}
            </span>
          )}
          {ctx?.after && <span className="redact-ctx"> {ctx.after}</span>}
        </div>
        {candidate.count > 1 && (
          <span className="redact-row__count small muted">appears {candidate.count} times</span>
        )}
      </div>
    </label>
  );
}
