/**
 * Stable anchor names the tour targets. Components spread `data-tour={ANCHOR.x}`
 * onto the element; step definitions target it with `sel(ANCHOR.x)`. Keeping the
 * names here (not scattered string literals) makes targeting typo-safe.
 *
 * The four mode tabs already carry `#tab-<id>` ids from the app shell, so those
 * use `tabSel(id)` and need no data-tour attribute.
 */
export const ANCHOR = {
  help: "help",
  toolsGrid: "tools-grid",
  composer: "composer",
  composerModes: "composer-modes",
  addContext: "add-context",
  prompts: "prompts",
} as const;

export type AnchorName = (typeof ANCHOR)[keyof typeof ANCHOR];

/** Selector for a data-tour anchor. */
export function sel(name: AnchorName): string {
  return `[data-tour="${name}"]`;
}

/** Selector for a mode tab button (they carry stable ids in the app shell). */
export function tabSel(id: string): string {
  return `#tab-${id}`;
}

/** The Review sub-nav container (always present on the Review tab). */
export const SUBNAV_SEL = ".subnav";
