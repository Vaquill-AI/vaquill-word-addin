import type { TourDef } from "../types";

/**
 * Deep guide for the Send-ready check. Opens the tool, then walks the rescan
 * control and the pre-send checklist of items that still need attention.
 */
export const sendReadyTour: TourDef = {
  id: "tool-sendready",
  title: "Send-ready check",
  summary: "A pre-flight of everything still needing a fix before the document is sent.",
  steps: [
    {
      nav: { tool: "sendready" },
      title: "Check before you send",
      body: "Send-ready scans the open document for what should not leave the building: unresolved tracked changes, comments, sensitive data, defined-term and cross-reference defects, and sign-off status.",
    },
    {
      target: '[data-tour="sr-rescan"]',
      placement: "bottom",
      title: "Rescan any time",
      body: "The check runs when you open the tool. Rescan after you edit the document so the list reflects your latest changes.",
    },
    {
      target: '[data-tour="sr-checklist"]',
      placement: "top",
      title: "Work the checklist",
      body: "Each row shows what still needs attention. Accept changes or remove comments right here, and open the right tool to resolve the rest.",
    },
  ],
};
