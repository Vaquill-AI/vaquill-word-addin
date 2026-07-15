import type { AppTab, ReviewSub, ToolKey } from "@/app/nav";

/**
 * Navigation a step performs BEFORE it is shown, so the tour can walk the user
 * across tabs, review sub-tabs, and individual tools without them clicking. The
 * engine drives the app's own nav bus; the spotlight then points at where the
 * thing lives.
 */
export interface TourNav {
  tab?: AppTab;
  reviewSub?: ReviewSub;
  /** Open this tool in the Tools hub (implies the Tools tab). */
  tool?: ToolKey;
}

export type Placement = "top" | "bottom" | "auto";

export interface TourStep {
  /**
   * A `document.querySelector` string for the element to spotlight (e.g.
   * "#tab-review" or '[data-tour="composer"]'). Omit for a centered card with no
   * spotlight (intro / outro / whole-surface steps).
   */
  target?: string;
  title: string;
  body: string;
  /** Preferred tooltip side relative to the target; falls back automatically. */
  placement?: Placement;
  /** Navigation performed before this step renders. */
  nav?: TourNav;
}

export interface TourDef {
  id: string;
  /** Shown in the Guides menu and as the tour heading. */
  title: string;
  /** One-line description for the Guides menu. */
  summary: string;
  steps: TourStep[];
}
