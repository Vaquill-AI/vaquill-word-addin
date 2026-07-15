import { ANCHOR, sel, tabSel, SUBNAV_SEL } from "../anchors";
import type { TourDef } from "../types";

/**
 * First-run walkthrough: the 60-second lap of the whole add-in. Introduces each
 * of the four mode tabs (driving the app to each), the Review sub-sections, the
 * Tools grid, and where to replay a guide. Deeper per-surface guides live in
 * their own tours, launchable from the Guides menu.
 */
export const welcomeTour: TourDef = {
  id: "welcome",
  title: "Welcome to Vaquill AI for Word",
  summary: "A 60-second lap of every tab.",
  steps: [
    {
      title: "Welcome to Vaquill AI for Word",
      body: "Everything here works on the contract open in Word. Here is the 60-second lap of what each tab does.",
    },
    {
      nav: { tab: "assistant" },
      target: tabSel("assistant"),
      placement: "bottom",
      title: "Assistant",
      body: "Ask anything about the open contract, grounded in your document and US law. Ask a question, or switch to Edit to redline it.",
    },
    {
      nav: { tab: "review" },
      target: tabSel("review"),
      placement: "bottom",
      title: "Review",
      body: "Turn the contract into grounded redlines, triage the other side's changes, verify citations, and run playbooks.",
    },
    {
      nav: { tab: "review" },
      target: SUBNAV_SEL,
      placement: "bottom",
      title: "Review sections",
      body: "Switch between Redlines, Changes, Compare, Citations, and Playbooks here. There is a guided tour for Review in the Guides menu.",
    },
    {
      nav: { tab: "draft" },
      target: tabSel("draft"),
      placement: "bottom",
      title: "Draft",
      body: "Write a new agreement from a template and insert it into Word as formatted, clean content.",
    },
    {
      nav: { tab: "tools" },
      target: tabSel("tools"),
      placement: "bottom",
      title: "Tools",
      body: "One-click utilities on the open document: navigate defined terms, check figures, format, redact, and produce a send-ready copy.",
    },
    {
      nav: { tab: "tools" },
      target: sel(ANCHOR.toolsGrid),
      placement: "top",
      title: "Check, then Send",
      body: "Check tools verify the document; Send tools prepare it to leave the building. Each is one click.",
    },
    {
      nav: { tab: "tools" },
      target: sel(ANCHOR.help),
      placement: "bottom",
      title: "Guides live here",
      body: "Replay this tour, or open a step-by-step guide for any tab, from the Guides menu anytime.",
    },
    {
      title: "You are set",
      body: "Open a contract and try Review first. You can reopen any guide from the Guides menu in the top bar.",
    },
  ],
};
