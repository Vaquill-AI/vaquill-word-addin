import { SegmentedControl } from "@/ui/primitives";

export type RedlineFilter = "all" | "high" | "unresolved";

/**
 * Sticky review header: a progress bar showing how much of the review has been
 * addressed, plus filters to triage. Stays pinned while the redline list scrolls
 * beneath it so the reviewer always knows where they stand.
 */
export function ReviewToolbar({
  total,
  addressed,
  filter,
  onFilter,
  counts,
}: {
  total: number;
  addressed: number;
  filter: RedlineFilter;
  onFilter: (f: RedlineFilter) => void;
  counts: { all: number; high: number; unresolved: number };
}) {
  const pct = total === 0 ? 100 : Math.round((addressed / total) * 100);

  return (
    <div className="review-toolbar">
      <div className="review-toolbar__progress">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="small" style={{ fontWeight: 600 }}>
            {addressed} of {total} addressed
          </span>
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
      <SegmentedControl<RedlineFilter>
        label="Filter redlines"
        value={filter}
        onChange={onFilter}
        options={[
          { value: "all", label: "All", count: counts.all },
          { value: "high", label: "High", count: counts.high },
          { value: "unresolved", label: "Open", count: counts.unresolved },
        ]}
      />
    </div>
  );
}
