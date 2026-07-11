import { TONE_COLOR, type StatusTone } from "./status";
import "./filter-chips.css";

export interface FilterChipOption {
  key: string;
  label: string;
  /** Optional count shown after the label (e.g. how many items match). */
  count?: number;
  /** Optional status dot color. */
  tone?: StatusTone;
}

/**
 * A row of toggleable filter chips (multi-select). Each chip is a real toggle
 * button (`aria-pressed`), so the whole thing is keyboard + screen-reader
 * friendly. `active` is the set of currently-on keys; the caller owns the state.
 */
export function FilterChips({
  options,
  active,
  onToggle,
  ariaLabel = "Filters",
}: {
  options: FilterChipOption[];
  active: ReadonlySet<string>;
  onToggle: (key: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="filter-chips" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = active.has(o.key);
        return (
          <button
            key={o.key}
            type="button"
            className={`filter-chip${on ? " filter-chip--on" : ""}`}
            aria-pressed={on}
            onClick={() => onToggle(o.key)}
          >
            {o.tone && (
              <span
                className="filter-chip__dot"
                style={{ background: TONE_COLOR[o.tone] }}
                aria-hidden
              />
            )}
            <span>{o.label}</span>
            {typeof o.count === "number" && <span className="filter-chip__count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
