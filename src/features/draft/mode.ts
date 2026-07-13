/**
 * The Draft tab's ways to get content into the open document.
 *
 * The primary three (generate a new draft, insert a firm template, insert a
 * prior saved draft) are the toggle. `transplant`, `fill`, and `clauses` are
 * secondary "bring content in" modes reached from a section in the Generate
 * view, not the toggle, so the control stays at three (it is built for 2-3 and
 * clips beyond that in the narrow pane).
 */
export type DraftMode = "generate" | "templates" | "saved" | "transplant" | "fill" | "clauses";

export const DRAFT_MODE_OPTIONS: { value: DraftMode; label: string }[] = [
  { value: "generate", label: "Generate" },
  { value: "templates", label: "Templates" },
  { value: "saved", label: "Saved" },
];
