# Vaquill AI for Word: Community (bring-your-own-key) edition

The community edition runs the Word add-in against your OWN AI provider key, with no hosted Vaquill AI backend.
You host nothing but the static add-in files.
Your documents and prompts go only to the provider you choose (OpenAI or Anthropic), from your own machine.

This document is the overview of what the community edition is and what it can do.
To install and run it, follow [SELF_HOSTING.md](SELF_HOSTING.md).

## Install it

See [SELF_HOSTING.md](SELF_HOSTING.md) for step-by-step instructions to run it on your own computer or on a server for your firm.
In short: install Node.js, run `npm install`, run `npm run dev:community`, sideload `manifest.localhost.xml`, then paste your OpenAI or Anthropic key into the setup screen.
Your key stays on your device and is sent only to the provider you chose.

## What works in the community edition

Powered by your own key:

- Assistant chat over the open document.
- Rewrite, explain, plain-English, risk assessment, compliance check, guideline check.
- Bluebook citation-format check.
- Contract review: grounded redlines and the agentic "draft a stronger fix".
- Draft generation: a full first draft from a document type and your instructions (without the hosted product's corpus grounding).
- NDA triage.
- Playbook fit and a starter playbook library (with a seeded Mutual NDA).
- Clause transplant, fill-from-reference, and attach-a-document (for .docx, .txt, and .md references).
- Case-law existence check for cited cases, with your own free CourtListener token (added in Settings).
- Prompt library and clause library (saved on your device).

Runs entirely in Word with no key (already local):

- Proper Format, defined terms, cross-references, reading navigator, deal cockpit, figures check, send-ready check, clean copy, and tracked-changes review.

## What needs a Vaquill AI account (not in the community edition)

- Statute resolution, and good-law (treatment) signals for cases. These use Vaquill AI's statute and case-law data.
- Saving work back into the hosted Vaquill AI product (matters, vendors, usage, org).

## Known limits

- PDF and legacy .doc reference files are not parsed client-side yet; attach .docx, .txt, or .md.
- The authored tracked-changes .docx export and document compare need a change author that the browser cannot set, so they are not available in this edition.
- "Bring your own key" is not the same as "offline": when you use OpenAI or Anthropic, your document text and prompts are sent to that provider.

## Privacy and security

Your API key lives in the add-in's own browser storage on your machine.
It is never sent to Vaquill AI, and only sent to the provider you chose.
Because it is your own key on your own device, treat this box like any machine that holds a live API key: keep it patched and access-controlled.

## License

Apache-2.0. See [LICENSE](LICENSE).
