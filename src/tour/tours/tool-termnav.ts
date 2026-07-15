import type { TourDef } from "../types";

/**
 * Deep guide for the Reading navigator tool: resolve a defined term or a
 * cross-reference from your selection and jump to it without leaving the clause
 * you are reading. Opens the tool via the nav bus, then spotlights each control.
 */
export const termNavTour: TourDef = {
  id: "tool-termnav",
  title: "Reading navigator",
  summary: "Look up a defined term or cross-reference and jump to it.",
  steps: [
    {
      nav: { tool: "termnav" },
      title: "Reading navigator",
      body: "Resolve what a clause is pointing at without scrolling away. Select a defined term or a reference like 'Section 7.2', then look it up.",
    },
    {
      target: '[data-tour="tn-lookup"]',
      placement: "bottom",
      title: "Look up your selection",
      body: "Highlight a term or cross-reference in the document, then click here. The tool reads your current selection.",
    },
    {
      target: '[data-tour="tn-result"]',
      placement: "bottom",
      title: "See the definition or target",
      body: "A defined term shows its meaning; a reference shows the clause it points to. Use the locate button to jump straight there.",
    },
    {
      target: '[data-tour="tn-terms"]',
      placement: "top",
      title: "Browse every defined term",
      body: "Every quoted, capitalized definition in the document is listed here. Search by name and jump to any occurrence.",
    },
  ],
};
