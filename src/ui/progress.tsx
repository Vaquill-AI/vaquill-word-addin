import "./progress.css";

/**
 * Bounded determinate progress bar with an "N of M" label. For runs whose total
 * is known up front (e.g. "Processing 4 of 17 rules"). For an UNKNOWN total
 * ("23 generated so far"), just render the count inside a `LiveRegion` from
 * primitives; no dedicated component is needed.
 */
export function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="pbar">
      <div
        className="pbar__track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? "Progress"}
      >
        <span className="pbar__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="small muted">{label ?? `${value} of ${max}`}</span>
    </div>
  );
}

/**
 * Floating "scroll to latest" pill for long streamed transcripts. Visibility is
 * controlled by the parent (render it only when the user has scrolled up); place
 * it inside a `position: relative` container.
 */
export function ScrollToBottomPill({
  onClick,
  label = "Scroll to latest",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="scroll-pill"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <svg
        viewBox="0 0 24 24"
        width={16}
        height={16}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 5v14M19 12l-7 7-7-7" />
      </svg>
    </button>
  );
}
