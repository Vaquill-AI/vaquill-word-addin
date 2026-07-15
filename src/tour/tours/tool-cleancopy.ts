import type { TourDef } from "../types";

export const cleanCopyTour: TourDef = {
  id: "tool-cleancopy",
  title: "Clean copy",
  summary: "Flatten tracked changes and strip comments before you send a document.",
  steps: [
    {
      title: "Prepare a send-ready file",
      body: "Clean copy scans the open document, then produces a version that is safe to send outside. Let's walk through the two safeguards it applies.",
      nav: { tool: "cleancopy" },
    },
    {
      target: '[data-tour="cc-accept"]',
      title: "Accept every tracked change",
      body: "Turn all tracked edits into final text so the recipient sees a clean document, not your redline. Leave this on unless you want to send the markup.",
      placement: "auto",
    },
    {
      target: '[data-tour="cc-comments"]',
      title: "Remove every comment",
      body: "Comments travel inside the .docx file. Any internal note would be visible to whoever you send it to, so removing them prevents a costly leak.",
      placement: "auto",
    },
    {
      target: '[data-tour="cc-produce"]',
      title: "Produce the clean copy",
      body: "Confirm your choices and flatten the document in one deliberate step. Word's Undo reverses it if you need the original back.",
      placement: "top",
    },
  ],
};
