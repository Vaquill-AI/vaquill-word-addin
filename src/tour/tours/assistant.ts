import { ANCHOR, sel } from "../anchors";
import type { TourDef } from "../types";

/** Deep guide for the Assistant tab: the composer, Ask/Edit, context, prompts. */
export const assistantTour: TourDef = {
  id: "assistant",
  title: "Assistant",
  summary: "Ask about the contract, or edit it.",
  steps: [
    {
      nav: { tab: "assistant" },
      target: sel(ANCHOR.composer),
      placement: "top",
      title: "Ask about the open contract",
      body: "Type a question here. Answers are grounded in your document and US law, with checkable sources.",
    },
    {
      nav: { tab: "assistant" },
      target: sel(ANCHOR.composerModes),
      placement: "top",
      title: "Ask or Edit",
      body: "Stay in Ask for answers, or switch to Edit to have the assistant redline the document as native tracked changes.",
    },
    {
      nav: { tab: "assistant" },
      target: sel(ANCHOR.addContext),
      placement: "top",
      title: "Add context",
      body: "Ground the answer in US case law, your matter's documents, or the web, and attach a PDF or Word file for this question.",
    },
    {
      nav: { tab: "assistant" },
      target: sel(ANCHOR.prompts),
      placement: "top",
      title: "Prompt library",
      body: "Not sure what to ask? Pick a ready-made legal prompt to start from.",
    },
  ],
};
