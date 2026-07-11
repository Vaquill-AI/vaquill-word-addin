import { DistributionBar, type DistributionSegment } from "@/ui/DistributionBar";
import { severityOf } from "@/lib/severity";
import type { RedlineSuggestion } from "@/api/types";

/** Unique, in-order section references the redlines touch (drops blanks). */
function affectedSections(redlines: RedlineSuggestion[]): string[] {
  const seen = new Set<string>();
  for (const r of redlines) {
    const ref = r.sectionReference?.trim();
    if (ref) seen.add(ref);
  }
  return Array.from(seen);
}

/**
 * A compact at-a-glance strip above the redline list: the severity mix as a
 * distribution bar plus which sections the review touched. Purely additive to
 * the existing review; renders nothing when there are no redlines.
 */
export function ReviewOverview({ redlines }: { redlines: RedlineSuggestion[] }) {
  if (redlines.length === 0) return null;

  let high = 0;
  let medium = 0;
  let low = 0;
  for (const r of redlines) {
    const s = severityOf(r);
    if (s === "high") high += 1;
    else if (s === "medium") medium += 1;
    else low += 1;
  }

  const segments: DistributionSegment[] = [
    { tone: "red", count: high, label: "high severity" },
    { tone: "yellow", count: medium, label: "medium severity" },
    { tone: "neutral", count: low, label: "low severity" },
  ];
  const sections = affectedSections(redlines);
  const SHOWN = 8;

  return (
    <div className="card card--pad stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="small" style={{ fontWeight: 600 }}>
          {redlines.length} proposed redline{redlines.length === 1 ? "" : "s"}
        </span>
        {high > 0 && (
          <span className="small" style={{ color: "var(--red)", fontWeight: 600 }}>
            {high} high severity
          </span>
        )}
      </div>
      <DistributionBar segments={segments} />
      {sections.length > 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          Touches {sections.length} section{sections.length === 1 ? "" : "s"}:{" "}
          {sections.slice(0, SHOWN).join(", ")}
          {sections.length > SHOWN ? `, +${sections.length - SHOWN} more` : ""}
        </p>
      )}
    </div>
  );
}
