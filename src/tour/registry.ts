import type { TourDef } from "./types";
import { welcomeTour } from "./tours/welcome";
import { assistantTour } from "./tours/assistant";
import { reviewTour } from "./tours/review";
import { draftTour } from "./tours/draft";
import { toolsTour } from "./tours/tools";
// Deep Review-section guides.
import { redlinesDeepTour } from "./tours/redlines-deep";
import { changesDeepTour } from "./tours/changes-deep";
// Deep per-tool guides.
import { termsTour } from "./tours/tool-terms";
import { crossRefTour } from "./tours/tool-xref";
import { termNavTour } from "./tours/tool-termnav";
import { cockpitTour } from "./tours/tool-cockpit";
import { figuresTour } from "./tours/tool-figures";
import { sendReadyTour } from "./tours/tool-sendready";
import { properFormatTour } from "./tours/tool-properformat";
import { cleanCopyTour } from "./tours/tool-cleancopy";
import { redactTour } from "./tours/tool-redact";

/**
 * Order shown in the Guides menu: the welcome lap, then the per-tab guides, then
 * the per-tool guides (grouped Check, then Send, matching the Tools launcher).
 */
export const TOURS: TourDef[] = [
  welcomeTour,
  assistantTour,
  reviewTour,
  draftTour,
  toolsTour,
  // Review deep dives
  redlinesDeepTour,
  changesDeepTour,
  // Check tools
  termsTour,
  crossRefTour,
  termNavTour,
  cockpitTour,
  figuresTour,
  // Send tools
  sendReadyTour,
  properFormatTour,
  cleanCopyTour,
  redactTour,
];

export const WELCOME_TOUR_ID = welcomeTour.id;

/** Grouped view for the Guides menu, so 14 tours stay scannable. */
export const TOUR_GROUPS: { label: string; tours: TourDef[] }[] = [
  { label: "Start here", tours: [welcomeTour] },
  { label: "Tabs", tours: [assistantTour, reviewTour, draftTour, toolsTour] },
  { label: "Review sections", tours: [redlinesDeepTour, changesDeepTour] },
  { label: "Check tools", tours: [termsTour, crossRefTour, termNavTour, cockpitTour, figuresTour] },
  { label: "Send tools", tours: [sendReadyTour, properFormatTour, cleanCopyTour, redactTour] },
];

export function getTour(id: string): TourDef | undefined {
  return TOURS.find((t) => t.id === id);
}
