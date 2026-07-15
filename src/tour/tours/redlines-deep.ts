import type { TourDef } from "../types";

/**
 * Deep guide for the Review -> Redlines flow: set up the review, run it, and work
 * the redlines. The result-state controls (redline cards, sign-off gate) only
 * exist after a review runs, so those steps are described in centered cards.
 */
export const redlinesDeepTour: TourDef = {
  id: "redlines-deep",
  title: "Redlines",
  summary: "Run a review and work the redlines.",
  steps: [
    {
      nav: { tab: "review", reviewSub: "redlines" },
      title: "Redlines: the core review",
      body: "Turn the open contract into grounded redlines, each applied as a native Word tracked change.",
    },
    {
      target: '[data-tour="rl-setup"]',
      placement: "bottom",
      title: "Set it up",
      body: "Open Adjust to set the contract type, whose paper it is, and how firm the markup should be. The type is auto-detected, so you can usually just run it.",
    },
    {
      target: '[data-tour="rl-run"]',
      placement: "top",
      title: "Run the review",
      body: "Each finding comes back as a tracked change with a rationale and a severity, ready to accept in the document.",
    },
    {
      title: "Work each redline",
      body: "Accept a redline, edit its language before applying, or reject it. Save language you accept to your clause library. A sign-off gate can require manager, partner, or GC approval before the document is sent.",
    },
  ],
};
