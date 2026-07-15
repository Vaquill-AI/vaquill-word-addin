import type { TourDef } from "../types";

/**
 * Deep guide for the Review -> Changes flow: triaging the counterparty's tracked
 * changes against a playbook + client rules. The triage controls and change cards
 * appear once the document has tracked changes; otherwise the steps center.
 */
export const changesDeepTour: TourDef = {
  id: "changes-deep",
  title: "Changes",
  summary: "Triage the other side's edits.",
  steps: [
    {
      nav: { tab: "review", reviewSub: "changes" },
      title: "Changes: triage their edits",
      body: "When the other side returns the contract, their tracked changes and comments appear here to accept, reject, or reply to.",
    },
    {
      target: '[data-tour="ch-playbook"]',
      placement: "bottom",
      title: "Grade against your positions",
      body: "Pick the playbook to grade the changes against. Your active client's standing rules apply automatically on top of it.",
    },
    {
      target: '[data-tour="ch-triage"]',
      placement: "bottom",
      title: "AI triage",
      body: "Classifies every change accept, review, or reject, with a short reason and the clause it relates to.",
    },
    {
      target: '[data-tour="ch-change"]',
      placement: "top",
      title: "Each change",
      body: "See the verdict and, when a clause is flagged, your fallback ladder to counter with. Accept, reject, or draft a reply as a comment.",
    },
    {
      target: '[data-tour="ch-accept"]',
      placement: "top",
      title: "Accept the safe ones",
      body: "Accept all the approved changes in one click, then handle the rest individually or in bulk by author.",
    },
  ],
};
