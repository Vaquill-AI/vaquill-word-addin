import type { ReactNode } from "react";

/**
 * Sticky review header: a progress bar showing how much of the review has been
 * addressed. Stays pinned while the redline list scrolls beneath it so the
 * reviewer always knows where they stand. An optional sign-off chip sits inline
 * with the progress count so the header stays compact.
 */
export function ReviewToolbar({
  total,
  addressed,
  signoff,
}: {
  total: number;
  addressed: number;
  signoff?: ReactNode;
}) {
  const pct = total === 0 ? 100 : Math.round((addressed / total) * 100);

  return (
    <div className="review-toolbar">
      <div className="review-toolbar__progress">
        <div className="review-toolbar__status">
          <div className="review-toolbar__status-left">
            {signoff}
            <span className="small" style={{ fontWeight: 600 }}>
              {addressed} of {total} addressed
            </span>
          </div>
          <span className="small muted">{pct}%</span>
        </div>
        <div
          className="progressbar"
          role="progressbar"
          aria-label="Review progress"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="progressbar__fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
