/**
 * The Draft tab's three ways to get content into the open document: generate a
 * new draft, insert a firm template, or insert a prior saved draft. Shared so
 * the toggle and its options live in one place, not duplicated across views.
 */
export type DraftMode = "generate" | "templates" | "saved";

export const DRAFT_MODE_OPTIONS: { value: DraftMode; label: string }[] = [
  { value: "generate", label: "Generate" },
  { value: "templates", label: "Templates" },
  { value: "saved", label: "Saved" },
];
