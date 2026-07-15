import type { TourDef } from "../types";

export const termsTour: TourDef = {
  id: "tool-terms",
  title: "Defined terms",
  summary: "Catch defined terms that are used but never defined, defined twice, or never used.",
  steps: [
    {
      title: "Defined terms",
      body: "This tool checks defined-term hygiene across your document. It flags terms used but never defined, defined more than once, or defined but never used, so nothing slips through a redline.",
      nav: { tool: "terms" },
    },
    {
      target: '[data-tour="terms-rescan"]',
      title: "Rescan on demand",
      body: "The report refreshes automatically as you edit, but you can rescan any time after a large paste or revision to re-check the whole document.",
      placement: "bottom",
    },
    {
      target: '[data-tour="terms-findings"]',
      title: "Read the findings",
      body: "Issues are grouped by type, with the likely gaps shown first and cleanup last. Each entry shows the term and a short snippet of where it appears.",
      placement: "top",
    },
    {
      target: '[data-tour="terms-find"]',
      title: "Jump to the term",
      body: "Select Find to move your cursor straight to that term in the document, so you can fix the definition without hunting for it.",
      placement: "top",
    },
  ],
};
