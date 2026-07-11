import type { RedactCandidate } from "./detect";

/**
 * One detected value with a confirm checkbox. Checked = will be redacted; the
 * user unchecks to keep it. The value is shown verbatim (monospace) so the user
 * can verify exactly what will be removed.
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
  return (
    <label className="redact-row">
      <input type="checkbox" checked={confirmed} onChange={onToggle} />
      <span className="redact-row__text" title={candidate.text}>
        {candidate.text}
      </span>
      {candidate.count > 1 && <span className="redact-row__count small muted">×{candidate.count}</span>}
    </label>
  );
}
