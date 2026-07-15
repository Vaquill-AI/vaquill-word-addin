# Vaquill AI for Word

A Microsoft Word add-in (task pane) that brings Vaquill AI contract review, grounded redlining, drafting, and US legal research into Word.

Today it is a **thin client**.
It reads the open document through the Office JavaScript API, calls the Vaquill AI backend, and applies the results back into the document as native Word tracked changes, comments, and content controls.
It does not perform contract analysis, retrieval, or generation on its own.
The legal intelligence lives in the backend, so the hosted add-in will not run standalone with only an LLM API key.

Everything operates on the document you already have open in Word.
There is no separate upload step: the open document is the subject.

> **Community edition (bring-your-own-key).**
> A standalone, self-hostable **community build that runs on your own API key (OpenAI or Anthropic)** is available.
> It runs the add-in against your own provider, with no hosted Vaquill AI backend.
> To run it, follow [SELF_HOSTING.md](SELF_HOSTING.md) (step by step). For what it can do, see [COMMUNITY.md](COMMUNITY.md).
> The default (cloud) build in this repo still targets the hosted backend (see [Backend requirement](#backend-requirement)).

## What works in each edition

| Capability | Vaquill AI (hosted) | Community (your own key) |
| --- | --- | --- |
| Assistant chat over the open document | Yes, grounded in the legal corpus, the web, and your matter files | Yes, grounded in the open document |
| Rewrite, explain, plain-English, risk, compliance, and guideline checks | Yes | Yes |
| Bluebook citation-format check | Yes | Yes |
| Contract review and grounded redlines | Yes | Yes |
| Agentic "draft a stronger fix" | Yes | Yes |
| NDA triage | Yes | Yes |
| Playbook fit and playbook library | Yes | Yes, saved on your device |
| Draft generation | Yes, with corpus and case-law grounding, cited authorities, and a quality score | Yes, without corpus grounding, authorities, or a quality score |
| Clause transplant, fill-from-reference, attach a document | Yes (PDF, DOCX, and more) | Yes (DOCX, TXT, MD) |
| Prompt and clause libraries | Yes, synced to your account | Yes, saved on your device |
| Document tools (Proper Format, defined terms, cross-references, reading navigator, deal cockpit, figures, send-ready, clean copy, tracked-changes review) | Yes | Yes, identical and fully local |
| Case-law existence check (does a cited case exist) | Yes, against the Vaquill AI corpus | Yes, with your own free CourtListener token |
| Good-law / treatment signal (is a case still good law) | Yes | No |
| Statute verification and legal research | Yes | No |
| Authored tracked-changes .docx export | Yes | No |
| Document compare (redline against a reference) | Yes | No |
| Save work to matters, vendors, or the web app | Yes | No |
| AI provider | Managed by Vaquill AI | Your own OpenAI or Anthropic key |
| Where your text is sent | Vaquill AI's backend | Only to the AI provider you choose |
| Hosting | Nothing to run, we host it | You run it, on your machine or your own server |
| Account | Vaquill AI account | No account, just your key |
| Cost | Subscription | You pay your AI provider directly |

## Try it on your own computer (community edition)

You need Node.js (from https://nodejs.org) and Microsoft Word.
It works on Word for Windows, Word for Mac, and Word on the web.

Set up once:

```
git clone https://github.com/Vaquill-AI/vaquill-word-addin.git
cd vaquill-word-addin
npm install
npx office-addin-dev-certs install
```

Start it, and leave the window open:

```
npm run dev:community
```

Then:

1. Load it into Word by sideloading `manifest.localhost.xml`. On Word on the web, open Add-ins, then "Upload My Add-in". The Mac and Windows steps are in [SELF_HOSTING.md](SELF_HOSTING.md).
2. In Word, click "Open Vaquill AI", then paste your OpenAI or Anthropic key.

Two guides cover the rest:

- [SELF_HOSTING.md](SELF_HOSTING.md): how to run it, step by step, on your computer or a server, for every version of Word.
- [COMMUNITY.md](COMMUNITY.md): what the community edition can do, and its limits.

---

## Features

The task pane has four tabs.
The **Assistant** is the default landing tab and the most flexible entry point; the others are structured, single-purpose workflows.

### Assistant

A grounded chat and redline surface over the open contract, with two modes in one composer.

**Ask** answers questions about the open document, grounded in the document itself and (optionally) the US legal corpus and your matter's files.

- Every answer carries checkable **sources**: a numbered list where citation `[N]` maps to source N, with links out where the backend provides them.
- Inline citations are **hoverable and clickable** (hover shows the source; click scrolls to it).
- **Multi-turn memory**: follow-ups are understood in the context of the conversation.
- **Add context** menu: choose what the answer draws on (US case law and statutes, your matter's documents, and web search as an off-by-default opt-in).
- **Attach files** as extra context, with opt-in OCR for scanned PDFs.
- A **prompt library**, an AI **Improve** for your prompt, and a **focus control** to answer about the whole document or just your selection.
- **Copy** (formatted paste into Word, clean text elsewhere) and **Insert into document** (as a tracked change) on every answer.
- Device-local **history** of past chats.

**Edit** turns a plain-English instruction into grounded redlines across the whole document.

- Each edit quotes verbatim current language, so it anchors to real text and applies as a tracked change you accept or reject.
- The set is **agentic**: a dynamic overview explains what it understood and did, each card carries a rationale and a fallback position, and a closing summary says what to check.
- It is **conversational**: a follow-up refines the current set ("make those stronger", "drop #2", "also cap liability") instead of starting over, and your accept/reject decisions carry across refinements.
- Edits are gated against your doc-type playbook for approval level (manager / partner / GC) and deal-breaker flags, and against an anti-hallucination grounding check.

**Selection tools** act on highlighted text: rewrite, explain, plain-English, risk assessment, and compliance check.

The Assistant can also route a chat message into a document action (redline, navigate to a clause, add a comment, accept all changes, make a clean copy), always behind an explicit confirm.

### Review

Turn the open contract into a structured set of grounded redlines.

- Contract type and your side are auto-detected (and adjustable), then the review runs against your playbook.
- Redlines show **severity**, an **inline diff** (with a Redline / Final toggle), the **why**, and a **fallback if rejected**.
- A server-computed **sign-off gate** (manager / partner / GC) and **deal-breaker** flags tell you what needs approval before sending.
- Apply changes as native tracked changes, or export a corrected `.docx` with tracked changes and comments baked in.
- Per-clause **"draft a stronger fix"** runs an agentic diagnose to draft to validate to critique loop.
- Sub-tabs: **Redlines**, **Changes** (triage the counterparty's tracked changes and comments with per-author bulk accept/reject), **Compare** (two versions, with a hidden-revision detector), **Citations** (verify every case citation against the US case-law corpus), and **Playbooks**.

### Draft

Generate a first-draft agreement from a plain-English brief and insert it as formatted content, template-constrained to reduce hallucination.
Reuse saved templates and drafts.

### Tools

Finalize and QA utilities: clean copy (accept all changes and remove comments), defined-term consistency, cross-reference check, a send-ready check, redaction, and document formatting.

### In the document

Highlight issues, push rationales as native comments, bookmark clauses for durable navigation, tag key fields as content controls, and jump around via a clause outline.

### Cross-links back to the platform

Save a review or draft to a matter, save as a template, add to the vendor registry, push a clause to a playbook, and save an answer as a note.

---

## How to use it

Once the add-in is loaded, it opens on the **Assistant** tab.

- **Ask a question.** Type into the composer and send. You get a grounded answer with numbered sources; click a citation to jump to its source, then Copy or Insert the answer.
- **Make a change.** Switch the composer to **Edit**, describe the change ("cap the confidentiality term at three years and add the standard carve-outs"), and review the redline cards. Accept or reject each; ask a follow-up to refine the set.
- **Review a contract.** Open the **Review** tab, confirm the detected type and side, and run it. Work through the redlines, watch the sign-off gate, then apply in place or download a corrected `.docx`.
- **Draft something new.** Open **Draft**, describe the agreement, and insert it.
- **Finalize.** Use **Tools** to make a clean copy, redact, or run the send-ready check before the document leaves your desk.

---

## Requirements

- A Microsoft 365 account and Word (Windows desktop, Mac desktop, or Word on the web).
- Office.js requirement floor **WordApi 1.6**.
- The **Vaquill AI backend** (not included; see below). The upcoming community edition removes this in favor of BYOK.

## Getting started (development)

Requires Node 20+.

```bash
npm install
cp .env.example .env                 # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npx office-addin-dev-certs install    # trusted HTTPS for localhost
npm run dev                           # serves the task pane on https://localhost:3000
npm run sideload                      # loads manifest.dev.xml into Word and opens it
```

Verify and build:

```bash
npm run type-check                    # tsc, no emit
npm run build                         # outputs dist/ (deploy behind HTTPS)
npm run validate:manifest             # validate the production manifest
```

The change gate for a contribution is a green `npm run type-check` and `npm run build`.

Deployment (Docker plus a hardened nginx with security headers and CSP) is documented in [DEPLOY.md](DEPLOY.md).

## Backend requirement

The hosted add-in requires the Vaquill AI backend.
The only backend change needed to run it is CORS: add the add-in origin (`https://word.vaquill.ai`, plus `https://localhost:3000` for dev) to the backend's allowed origins.
Everything else reuses existing endpoints.

The **community edition (in progress)** will lift this requirement: bring your own API key and point the add-in at your own model and infrastructure, so it runs 100% locally with no hosted dependency.

## Architecture

```text
Word (desktop / Mac / web)
  task pane (word.vaquill.ai)  --Office.js-->  the open document
        |
        |  Supabase JWT (Bearer) + SSE
        v
  Vaquill AI backend (api.vaquill.ai)   [required today; BYOK in the community edition]
```

## Tech stack

- Vite + React 18 + TypeScript task pane, served as static HTTPS assets.
- Office.js from the Microsoft CDN, requirement floor WordApi 1.6.
- Add-in-only XML manifest (Windows, Mac, web).
- Supabase auth via the Office Dialog API and PKCE (session held in memory only).
- Word-level tracked-change diff via `office-word-diff` (Apache-2.0); see [NOTICE](NOTICE).

## Project layout

```text
src/
  app/          app shell + tab navigation
  features/     one folder per surface (assistant, review, draft, tools, ...)
  office/       Office.js helpers: search/anchoring, redline apply, comments, ...
  api/          typed backend clients (chat, contract-review, edit, research, ...)
  ui/           shared primitives and design-system components
  lib/          framework-agnostic helpers
```

## Documentation

Deeper design and reference material lives in [docs/](docs/): architecture, the feature spec, the Office.js capability map, the design system, and the competitive landscape.

## Contributing

Issues and pull requests are welcome.

## License

Apache License 2.0.
See [LICENSE](LICENSE) and [NOTICE](NOTICE).
