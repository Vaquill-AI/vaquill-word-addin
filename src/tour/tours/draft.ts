import { tabSel } from "../anchors";
import type { TourDef } from "../types";

/** Guide for the Draft tab. */
export const draftTour: TourDef = {
  id: "draft",
  title: "Draft",
  summary: "Generate a first draft into Word.",
  steps: [
    {
      nav: { tab: "draft" },
      target: tabSel("draft"),
      placement: "bottom",
      title: "Draft a new agreement",
      body: "Create a first draft without leaving Word.",
    },
    {
      nav: { tab: "draft" },
      title: "Template-constrained drafting",
      body: "Pick a document type and a starter, generate a first draft, and insert it into Word as formatted content. It is constrained to real templates to prevent invented clauses.",
    },
  ],
};
