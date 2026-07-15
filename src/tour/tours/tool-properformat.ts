import type { TourDef } from "../types";

/**
 * Deep guide for the Proper Format tool. Opens the tool, then walks the scope
 * control, the detected fixes, and the one-click standardize action.
 */
export const properFormatTour: TourDef = {
  id: "tool-properFormat",
  title: "Proper Format",
  summary: "Unify body font, size, and spacing without touching numbering or signatures.",
  steps: [
    {
      nav: { tool: "properFormat" },
      title: "Make formatting consistent",
      body: "Proper Format unifies ordinary body paragraphs toward the document's own dominant style. Tables, lists, headings, numbering, and signatures are never changed.",
    },
    {
      target: '[data-tour="pf-scope"]',
      placement: "bottom",
      title: "Choose what to check",
      body: "Run across the whole document, or narrow to just the text you have selected. The scan reruns instantly when you switch.",
    },
    {
      target: '[data-tour="pf-fixes"]',
      placement: "top",
      title: "Review what it found",
      body: "Each inconsistency is listed with a count. Toggle any fix off if you want to leave that aspect alone.",
    },
    {
      target: '[data-tour="pf-apply"]',
      placement: "top",
      title: "Standardize in one click",
      body: "Apply the enabled fixes clean, not as tracked changes. Word Undo, Ctrl+Z, reverses the whole pass.",
    },
  ],
};
