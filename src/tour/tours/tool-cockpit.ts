import type { TourDef } from "../types";

export const cockpitTour: TourDef = {
  id: "tool-cockpit",
  title: "Deal cockpit",
  summary: "Track where each reviewed clause stands across the negotiation.",
  steps: [
    {
      title: "Deal cockpit",
      body: "The cockpit reads your last contract review and tracks where every clause stands. Run a review first, then use this tab to manage the negotiation clause by clause.",
      nav: { tool: "cockpit" },
    },
    {
      target: '[data-tour="cockpit-summary"]',
      title: "See the deal at a glance",
      body: "This line tells you how many clauses are agreed. The status is saved into the document, so it travels with the file across rounds.",
      placement: "bottom",
    },
    {
      target: '[data-tour="cockpit-status-chips"]',
      title: "Status counts",
      body: "These chips tally agreed, open, conceded, and rejected clauses. Watch the open count fall as the deal comes together.",
      placement: "bottom",
    },
    {
      target: '[data-tour="cockpit-status-select"]',
      title: "Mark each clause",
      body: "Set a clause to open, agreed, conceded, or rejected as you negotiate. Any deal-breaker still open is flagged so nothing slips through.",
      placement: "top",
    },
  ],
};
