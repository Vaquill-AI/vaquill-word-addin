# Vaquill AI for Word

A Microsoft Word add-in (task pane) that brings Vaquill AI contract review, grounded redlining, and drafting into Word.
It is a thin client: it reads the open document through the Office JavaScript API, calls the existing Vaquill backend, and applies the results back into the document as native Word tracked changes.

## Status

Phase 0 foundation and the flagship Contract Review flow are built, type-checked, and building.
The add-in has not yet been deployed to `word.vaquill.ai` or sideload-tested inside a live Word client.
Depth over breadth: one flow works end to end rather than many half-built ones. Playbooks, drafting, clause tools, NDA triage, risk, compliance, and grounded Ask are planned follow-ons that reuse the same foundation.

## What works today

- Sign in with Supabase through the Office dialog (no Entra registration needed).
- Read the whole document or the current selection.
- Stream a contract review from the backend (contract type, side, governing law, focus).
- Server-computed sign-off gate banner (manager / partner / GC), never recomputed client-side.
- Grounded redline cards with verified / verify-manually / new-clause badges.
- Apply a verified redline as a native tracked change (word-level diff, not a whole-clause swap).
- Insert a missing clause as a tracked insertion.
- Accept all as an authoritative tracked-changes .docx generated server-side (authored "Vaquill AI Contract Review"), inserted in place or downloaded.
- Typed error states for quota (402), document too large (413), no access (404), and stream truncation.

## Architecture

```text
Word (desktop / Mac / web)
  task pane (word.vaquill.ai)  --Office.js-->  the open document
        |
        |  Supabase JWT (Bearer) + SSE
        v
  Vaquill backend (api.vaquill.ai)  [existing, reused]
```

Full detail is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

- Vite + React 18 + TypeScript task pane, served as static HTTPS assets.
- Office.js from the Microsoft CDN, requirement floor WordApi 1.6.
- Add-in-only XML manifest (cross-platform: Windows, Mac, web).
- Supabase auth via the Office Dialog API + PKCE.
- Redline engine reused from `office-word-diff` (Apache-2.0). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Repository layout

```text
manifest.xml         production manifest (word.vaquill.ai)
manifest.dev.xml     dev manifest (localhost:3000), sideload this one
index.html           task pane entry
auth.html            Supabase PKCE redirect page (opened in the auth dialog)
src/
  config.ts          env-driven config
  auth/              supabase client, in-memory session, dialog login, PKCE redirect
  api/               errors, http, sse, ids, types, contract-review
  office/            Word.run helpers, document read, redline engine, docx export
  ui/                shared UI kit (Button, Badge, Banner, Header)
  features/
    auth/            LoginView
    review/          the Contract Review flow (form, hook, cards, sign-off gate, accept-all)
docs/                research and design (competitive, tech, architecture, feature spec, PRD, OSS)
public/assets/       leaf logo + Office ribbon icons (16/32/80)
```

## Getting started

Requires Node 20+, a Microsoft 365 account, and Word (desktop or web).

```bash
npm install
cp .env.example .env          # fill in VITE_API_BASE, Supabase URL + anon key, addin origin
npx office-addin-dev-certs install   # trusted https for localhost
npm run dev                   # serves the task pane on https://localhost:3000
npm run sideload              # loads manifest.dev.xml into Word and opens it
```

Type-check and build:

```bash
npm run type-check
npm run build                 # outputs dist/ (deploy to word.vaquill.ai)
```

## Backend requirement

The only backend change needed to ship is adding the add-in origin to CORS.
Add `https://word.vaquill.ai` (and `https://localhost:3000` for dev) to `CORS_ORIGINS` in the backend `app/core/config.py`.
Everything else reuses existing endpoints: contract-review stream, export-corrected, and Supabase JWT auth.

## Docs

- [docs/PRD.md](docs/PRD.md) - product requirements and roadmap
- [docs/FEATURE_SPEC.md](docs/FEATURE_SPEC.md) - feature specification
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - system architecture
- [docs/OFFICE_ADDIN_TECH.md](docs/OFFICE_ADDIN_TECH.md) - Office add-in technical reference
- [docs/COMPETITIVE_LANDSCAPE.md](docs/COMPETITIVE_LANDSCAPE.md) - competitor teardown
- [docs/OSS_LANDSCAPE.md](docs/OSS_LANDSCAPE.md) - open-source landscape and reuse decisions
