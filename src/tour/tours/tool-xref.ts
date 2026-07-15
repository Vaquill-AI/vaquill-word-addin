import type { TourDef } from "../types";

export const crossRefTour: TourDef = {
  id: "tool-xref",
  title: "Cross-references",
  summary: "Catch internal references that point at a section or schedule that does not exist.",
  steps: [
    {
      title: "Cross-references",
      body: "This tool reads the document and checks every internal reference, like see Section 7.4 or Exhibit C, against the sections and schedules that actually exist.",
      nav: { tool: "xref" },
    },
    {
      target: '[data-tour="xref-rescan"]',
      title: "Rescan the document",
      body: "The check runs automatically and refreshes as you edit. Use Rescan to force a fresh pass after larger changes.",
      placement: "bottom",
    },
    {
      target: '[data-tour="xref-broken"]',
      title: "Broken references",
      body: "Each row is a reference that does not resolve, often left dangling after a clause was cut or renumbered. The count shows how many times it appears.",
      placement: "auto",
    },
    {
      target: '[data-tour="xref-find"]',
      title: "Jump to the reference",
      body: "Select Find to move your cursor straight to that reference in the document so you can fix or remove it.",
      placement: "top",
    },
  ],
};
