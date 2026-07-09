import { Button } from "@/ui/primitives";

/**
 * After a review runs, the setup form collapses to this one-line chip so the
 * results get the vertical space. "New review" reopens the form.
 */
export function SetupSummary({ parts, onNew }: { parts: string[]; onNew: () => void }) {
  return (
    <div className="setup-summary">
      <span className="setup-summary__parts small">{parts.filter(Boolean).join("  ·  ")}</span>
      <Button variant="ghost" size="sm" onClick={onNew}>
        New review
      </Button>
    </div>
  );
}
