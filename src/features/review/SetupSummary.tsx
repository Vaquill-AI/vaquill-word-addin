/**
 * After a review runs, the setup form collapses to this one-line "what was
 * reviewed" caption (contract type / side / jurisdiction) so the results get the
 * vertical space. Renders nothing when the run carried no setup params (e.g. a
 * hydrated/resumed review), so it never costs an empty row. "New review" lives on
 * the results-tab row alongside the tabs.
 */
export function SetupSummary({ parts }: { parts: string[] }) {
  const text = parts.filter(Boolean).join("  ·  ");
  if (!text) return null;
  return <span className="setup-summary__parts small">{text}</span>;
}
