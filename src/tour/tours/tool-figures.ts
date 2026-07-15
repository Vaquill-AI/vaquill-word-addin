import type { TourDef } from "../types";

/**
 * Guide for the Figures check tool: opens the tool, explains what it flags, then
 * points at a flagged pair and its Find control. Later steps have no nav and
 * anchor on literal data-tour selectors; if the document is all clear, those
 * targets are absent and the steps show as centered cards.
 */
export const figuresTour: TourDef = {
  id: "tool-figures",
  title: "Figures check",
  summary: "Catch numbers in words that disagree with the numeral beside them.",
  steps: [
    {
      nav: { tool: "figures" },
      title: "Figures check",
      body: "This tool scans the document for a number spelled out in words that does not match the numeral next to it, like 'thirty (40) days'. It runs automatically and refreshes as you edit.",
    },
    {
      target: '[data-tour="fig-header"]',
      title: "What it checks",
      body: "Every 'words (numeral)' pair is read and compared. When they agree you see an all clear message; when they disagree each conflict is listed below.",
    },
    {
      target: '[data-tour="fig-mismatch"]',
      title: "A flagged mismatch",
      body: "Each row shows the words value against the numeral value so you can see exactly which two figures disagree. Confirm which one is correct before you send the draft.",
    },
    {
      target: '[data-tour="fig-find"]',
      title: "Jump to the spot",
      body: "Use the Find control on a flagged row to jump straight to that phrase in the document and fix it in place.",
    },
  ],
};
