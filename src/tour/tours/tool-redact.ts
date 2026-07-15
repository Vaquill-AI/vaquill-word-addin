import type { TourDef } from "../types";

/**
 * Guide for the Redact tool: opens the tool, then walks the scan-and-review
 * loop. Copy is deliberate about permanence: Redact deletes the original text,
 * it does not hide it behind a mask, so a confirmed value cannot be recovered
 * from the file.
 */
export const redactTour: TourDef = {
  id: "tool-redact",
  title: "Redact",
  summary: "Find sensitive values and permanently remove the ones you confirm.",
  steps: [
    {
      nav: { tool: "redact" },
      title: "Redact sensitive values",
      body: "Redact scans for sensitive data, then permanently deletes the values you confirm. The original text is removed, not masked, so keep an unredacted copy before you start.",
    },
    {
      target: '[data-tour="redact-scope"]',
      title: "Choose the scope",
      body: "Scan the whole document, or limit the scan to only the text you have highlighted.",
    },
    {
      target: '[data-tour="redact-categories"]',
      title: "Pick what to look for",
      body: "Turn categories on or off, such as IDs, contact details, or financial data. Names, organizations, and locations are found with AI when you select them.",
    },
    {
      target: '[data-tour="redact-scan"]',
      title: "Scan for matches",
      body: "Run the scan to list every match in context. Nothing is changed yet, so you review before anything is removed.",
    },
    {
      target: '[data-tour="redact-apply"]',
      title: "Confirm, then redact",
      body: "Uncheck anything you want to keep, then redact the rest. This permanently deletes those values from the document, so confirm carefully.",
    },
  ],
};
