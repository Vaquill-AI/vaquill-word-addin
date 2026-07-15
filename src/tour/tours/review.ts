import { SUBNAV_SEL } from "../anchors";
import type { TourDef } from "../types";

/**
 * Deep guide for the Review tab: it walks the app through each of the five
 * sub-sections so the user sees them change behind the card.
 */
export const reviewTour: TourDef = {
  id: "review",
  title: "Review",
  summary: "Redline, triage, compare, verify.",
  steps: [
    {
      nav: { tab: "review", reviewSub: "redlines" },
      target: SUBNAV_SEL,
      placement: "bottom",
      title: "Five review sections",
      body: "Switch sections here. We will walk through each one.",
    },
    {
      nav: { reviewSub: "redlines" },
      title: "Redlines",
      body: "Run a grounded review of the open contract. Each finding becomes a tracked change you accept, edit, or reject, and can save to your clause library.",
    },
    {
      nav: { reviewSub: "changes" },
      title: "Changes",
      body: "Triage the other side's tracked changes. AI grades each accept / review / reject against your playbook and the client's rules, and drafts replies.",
    },
    {
      nav: { reviewSub: "compare" },
      title: "Compare",
      body: "Blackline two versions to see exactly what moved between drafts.",
    },
    {
      nav: { reviewSub: "citations" },
      title: "Citations",
      body: "Verify every case and statute the contract cites against the US corpus, with good-law signals.",
    },
    {
      nav: { reviewSub: "playbooks" },
      title: "Playbooks",
      body: "Your saved negotiation positions and fallback ladders. Selecting one drives the review to your firm's standard.",
    },
  ],
};
