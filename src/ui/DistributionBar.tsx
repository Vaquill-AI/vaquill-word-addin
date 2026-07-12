import { TONE_COLOR, type StatusTone } from "./status";
import "./distribution-bar.css";

export interface DistributionSegment {
  tone: StatusTone;
  count: number;
  /** Human label for the accessible summary and tooltip, e.g. "compliant". */
  label: string;
}

/**
 * A proportional, single-line summary of a result set (green / yellow / red /
 * neutral segments sized by count). Zero-count segments are omitted. Purely
 * presentational; the caller supplies the segments in display order.
 */
export function DistributionBar({
  segments,
  ariaLabel,
}: {
  segments: DistributionSegment[];
  ariaLabel?: string;
}) {
  const shown = segments.filter((s) => s.count > 0);
  const total = shown.reduce((sum, s) => sum + s.count, 0);
  const summary = ariaLabel ?? shown.map((s) => `${s.count} ${s.label}`).join(", ");

  return (
    <div className="dist-bar" role="img" aria-label={total === 0 ? "No results" : summary}>
      {total === 0 ? (
        <span className="dist-bar__empty" />
      ) : (
        shown.map((s, i) => (
          <span
            // Index-keyed: two segments can legitimately share tone+label, so a
            // tone/label key could collide. Order is stable (caller-supplied).
            key={`${i}-${s.tone}`}
            className="dist-bar__seg"
            style={{ flexGrow: s.count, background: TONE_COLOR[s.tone] }}
            title={`${s.count} ${s.label}`}
          />
        ))
      )}
    </div>
  );
}
