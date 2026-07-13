/**
 * The Draft tab's ways to get content into the open document. `generate` is the
 * default surface; `transplant`, `fill`, and `clauses` are secondary "bring
 * content in" modes reached from a section in the Generate view. (Template and
 * saved-draft browsing deep-links to the web app, so they are not modes here.)
 */
export type DraftMode = "generate" | "transplant" | "fill" | "clauses";
