# Vaquill AI for Word

A Microsoft Word add-in (task pane) that brings Vaquill AI contract review, grounded redlining, drafting, and US legal research into Word.

It is a **thin client**: it reads the open document through the Office JavaScript API, calls the Vaquill AI backend, and applies the results back into the document as native Word tracked changes, comments, and content controls. It does not perform contract analysis, retrieval, or generation on its own; the legal intelligence lives in the backend. It will not run standalone with only an LLM API key.

## What it does

- **Review** a contract into grounded redlines applied as native tracked changes, with severity, inline diff, a server-computed sign-off gate (manager / partner / GC), and a corrected `.docx` export.
- **Triage** the counterparty's tracked changes and comments, with per-author bulk accept/reject.
- **Authority** check: verify every case citation against the US case-law corpus.
- **Sign-off** governance stored inside the `.docx` (custom XML), so it travels with the file.
- **Playbooks**: insert your negotiation positions and fallback ladders as tracked changes.
- **Draft** a first-draft agreement and insert it as formatted content.
- **Assistant**: grounded chat over the open contract, plus select-to-rewrite/explain.
- **In the document**: highlight issues, push rationales as native comments, bookmark clauses, tag key fields as content controls, jump via a clause outline.
- **Cross-links** back into the platform: save the review or draft to a matter, save as a template, add to the vendor registry, push a clause to a playbook, save an answer as a note.

## Architecture

```text
Word (desktop / Mac / web)
  task pane (word.vaquill.ai)  --Office.js-->  the open document
        |
        |  Supabase JWT (Bearer) + SSE
        v
  Vaquill AI backend (api.vaquill.ai)   [required, not included]
```

## Tech stack

- Vite + React 18 + TypeScript task pane, served as static HTTPS assets.
- Office.js from the Microsoft CDN, requirement floor WordApi 1.6.
- Add-in-only XML manifest (Windows, Mac, web).
- Supabase auth via the Office Dialog API + PKCE (session in memory only).
- Word-level tracked-change diff via `office-word-diff` (Apache-2.0); see [NOTICE](NOTICE).

## Getting started

Requires Node 20+, a Microsoft 365 account, and Word (desktop or web).

```bash
npm install
cp .env.example .env          # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npx office-addin-dev-certs install   # trusted HTTPS for localhost
npm run dev                   # serves the task pane on https://localhost:3000
npm run sideload              # loads manifest.dev.xml into Word and opens it
```

```bash
npm run type-check
npm run build                 # outputs dist/ (deploy behind HTTPS)
```

Deployment (Docker + hardened nginx, security headers, CSP) is documented in [DEPLOY.md](DEPLOY.md).

## Backend requirement

This client requires the Vaquill AI backend. The only backend change to run it is CORS: add the add-in origin (`https://word.vaquill.ai`, and `https://localhost:3000` for dev) to the backend's allowed origins. Everything else reuses existing endpoints.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
