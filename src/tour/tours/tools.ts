import { ANCHOR, sel } from "../anchors";
import type { TourDef } from "../types";

/**
 * Guide for the Tools tab: introduces the grid, then opens a few representative
 * tools so the user sees each one. Opening a tool is driven via the nav bus.
 */
export const toolsTour: TourDef = {
  id: "tools",
  title: "Tools",
  summary: "Verify and finalize the document.",
  steps: [
    {
      nav: { tab: "tools" },
      target: sel(ANCHOR.toolsGrid),
      placement: "top",
      title: "One-click document tools",
      body: "Grouped Check (verify the document) and Send (prepare it to leave). We will open a few.",
    },
    {
      nav: { tool: "termnav" },
      title: "Reading navigator",
      body: "Select a defined term or a cross-reference like 'Section 7.2' and see what it means or points to, then jump to it.",
    },
    {
      nav: { tool: "figures" },
      title: "Figures check",
      body: "Find numbers written in words that do not match the numeral beside them, like 'thirty (40) days'.",
    },
    {
      nav: { tool: "properFormat" },
      title: "Proper Format",
      body: "Unify body font, size, and spacing safely. It never touches numbering, tables, or signatures.",
    },
    {
      nav: { tool: "cockpit" },
      title: "Deal cockpit",
      body: "Track where each reviewed clause stands across the negotiation: open, agreed, conceded, or rejected.",
    },
    {
      nav: { tool: "cleancopy" },
      title: "Clean copy",
      body: "Accept changes and strip comments to produce a send-ready file before it leaves the building.",
    },
  ],
};
