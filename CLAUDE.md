# CLAUDE.md

Vaquill for Microsoft Word - a Word task-pane add-in. Vite + React 18 + TypeScript SPA, Office.js (WordApi 1.6 floor), Supabase auth. Thin client over the existing Vaquill FastAPI backend.

> This is a **separate repo** from the main backend (`the Vaquill backend`). The add-in performs no contract analysis, retrieval, or generation of its own. The legal intelligence lives in the backend; this repo reads the open document through Office.js, calls the backend, and applies results back as native Word tracked changes, comments, and content controls. It will not run with only an LLM API key.

## Quick Reference Commands

```bash
npm install
cp .env.example .env                 # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npx office-addin-dev-certs install   # trusted HTTPS for localhost (one-time)
npm run dev                          # serve the task pane on https://localhost:3000
npm run sideload                     # load manifest.dev.xml into Word desktop
npm run sideload:stop
npm run type-check                   # tsc --noEmit
npm run build                        # tsc -b && vite build -> dist/
npm run lint                         # eslint
npm run validate:manifest            # validate manifest.xml
```

Requires Node 20+, a Microsoft 365 account, and Word (desktop or web). Deployment (Docker + hardened nginx, CSP, security headers) is in [DEPLOY.md](DEPLOY.md).

## Architecture

```text
Word (desktop / Mac / web)
  task pane (word.vaquill.ai)  --Office.js-->  the open document
        |
        |  Supabase JWT (Bearer) + SSE
        v
  Vaquill AI backend (api.vaquill.ai)   [required, unchanged except CORS]
```

Two hosted surfaces: the static task-pane SPA at `word.vaquill.ai`, and the unchanged backend at `api.vaquill.ai` reached over the same Supabase-JWT bearer auth and SSE contract the web app uses. Full detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); product rationale and roadmap in [docs/PRD.md](docs/PRD.md).

### The only required backend change

Add `https://word.vaquill.ai` (and `https://localhost:3000` for dev) to `CORS_ORIGINS` in the backend `app/core/config.py`. Because `CORS_ALLOW_CREDENTIALS` is true, the exact origin must match, so the pane must be served from `word.vaquill.ai`. `Authorization`, `Content-Type`, `X-Organization-ID`, and `X-Timezone` are already whitelisted. Everything else reuses existing endpoints.

## App Shell and Navigation

`src/App.tsx` renders seven primary tabs (`src/app/nav.tsx` `AppTab`): **home, review, draft, assistant, research, playbook, tools**. Home is a cockpit that routes into the others. Review is one hub with a sub-nav (`ReviewSub`: redlines / changes / citations / signoff). The document utilities (compliance, redact, fill, edit, transplant) fold under the single Tools launcher (`ToolKey`).

### Nav + intent bus (the cross-feature spine)

`src/app/nav.tsx` is the connective tissue. A lawyer's task crosses surfaces ("this clause is risky -> what's my position -> redline it"), so any surface can `navigate(tab, intent)` and hand the target a typed `AppIntent` (a pre-filled next step). The target view reads the intent on mount and calls `clearIntent()` once applied, so an intent fires exactly once. When adding cross-feature handoffs, extend `AppIntent` rather than wiring ad-hoc props.

The active-org change bumps `orgVersion`, which is the `key` on `app-body`, remounting data views (matters / drafts / playbooks / clients) so they refetch under the new org.

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/office/` | All Office.js document I/O (redline apply, search anchoring, comments, content controls, export, custom XML, selection). The only place `Word.run` lives. |
| `src/api/` | Bearer `fetch`, SSE parser, and one module per backend surface (contract-review, drafting, playbooks, chat, authority, research, etc.). |
| `src/auth/` | Office Dialog API + Supabase PKCE login, in-memory session, refresh rotation. |
| `src/features/` | One folder per surface (review, draft, assistant, research, playbook, compliance, redact, fill, edit, transplant, governance, home, tools, integration). |
| `src/ui/` | Shared primitives (Combobox, OverflowMenu, ToolCard, progress, icons, tokens). White theme only. |
| `src/lib/` | Cross-cutting helpers (prefs, org, sections, severity, governance, hash, tiptap). |
| `src/config.ts` | Runtime config. `apiBase` / `appBase` fixed by build mode; Supabase URL + anon key injected at build. No secrets. |
| `docs/` | PRD, ARCHITECTURE, FEATURE_SPEC, competitive research, Office.js capability notes, design system. |

## Critical Gotchas (Office.js)

### Tracked-change author is read-only
Office.js cannot set the author of a tracked change. Every programmatic edit made while tracking is on is attributed to the signed-in Word user. When edits must be attributed to "Vaquill AI Contract Review" regardless of the user's identity, use the **server-side export path** (`POST /legal-tools/export-corrected`, inserted via `body.insertFileFromBase64`), not in-pane edits.

### Redline apply = TrackAll + tracked insertText
Remember the prior `changeTrackingMode`, set `TrackAll`, anchor with `body.search(currentLanguage, {matchCase: true})` (respecting the 255-char search limit by anchoring on a shorter unique substring), `range.insertText(proposed, "Replace")`, then restore the prior mode and `sync()`. Only auto-apply `grounding === "verified"` redlines. `unverified` shows "verify manually"; `insertion` is a missing-clause add inserted at a chosen location, not searched for. Mirror the backend whitespace-normalized fallback; fall back to `export-corrected` for anything the pane cannot anchor.

### Never recompute server-deterministic values client-side
The sign-off `approvalGate`, `liabilityExposure`, and `counterpartyMatch` are computed deterministically server-side and must be rendered as-is, never recomputed in the pane.

### Word-on-the-web degradation and defensive enumeration
`insertOoxml` is reliable on desktop but has documented failures on Word on the web, so rich inserts prefer plain tracked `insertText` and fall back to the server DOCX. `getTrackedChanges` can fail on documents with moved changes, and `TrackedChange.getRange` differs across desktop and web, so enumeration is defensive. Use `getFirstOrNullObject` + `isNullObject`, never `getFirst`. `getFileAsync` can return error 11001 on some web tenants, so the text-only `body` path is default; always `closeAsync()` the file handle. Never block the UI thread more than 5 seconds (Office restarts the add-in, and disables it after 4 crashes per session).

### Never write PII/tokens into the Office Settings object
`Office.Settings` serializes into the document file and travels with it. Hold the access token in memory only. Review metadata that must survive save/close/reopen goes into custom XML parts (`Document.customXmlParts`), and analyzed clauses anchor in tagged content controls.

## Authentication

Office Dialog API + Supabase PKCE, not Office SSO. The task pane calls `displayDialogAsync` opening a same-origin page (`auth.html` on the add-in origin), which runs Supabase Authorization Code + PKCE in the isolated dialog webview. The dialog stringifies the access + refresh tokens and hands them back via `messageParent` (strings only; do not rely on shared `localStorage`). The task pane holds the JWT in memory and runs refresh-token rotation client-side. Office SSO `getAccessToken` and Nested App Authentication are deliberately unused because Entra-issued tokens are rejected by the Supabase-JWT backend.

First-run org picker uses the backend bootstrap dependency (`get_current_user_no_org`); all document/review/drafting calls use the full `get_current_user` gate.

## SSE Consumption

All analysis/drafting endpoints follow `init -> progress -> result -> done` (plus `error`). Chat uses the richer set (`thinking`, `sources`, `chunk`, `verification`, `done`, `error`, `heartbeat`). Rules (`src/api/sse.ts`):
- Endpoints are POST, so `EventSource` cannot be used. Use `fetch` + `response.body.getReader()` with a `TextDecoder`, setting the `Authorization` header directly. Do not use the `?_token=` query-param fallback.
- Parsing must be CRLF-safe and tolerate `data:` with or without a trailing space (Office often runs on Windows behind AV/proxies delivering `\r\n`). Flush the decoder tail.
- Handle a non-200 initial response before reading the body (402 quota / 429 rate limit can precede the stream).
- For chat, generate a UUID `clientMessageId`, send it, and persist the assistant message under the same id so verification/metrics do not orphan. On terminal `done`, replace streamed text with `corrected_content` when present (the citation remapper rewrote the answer).

## Multi-Tenancy

Trusted org is always JWT-derived server-side, never body-derived. The add-in may send `X-Organization-ID` for org selection; the backend verifies active membership and returns 401 on a stale/forged value. Roles in product are only `owner` and `member` (check `userRole === 'owner'`, never `'admin'`/`'viewer'`). Matter-scoped calls send `matterId`; a **404 means no access or not found**, not a bug (the backend returns 404 not 403 to avoid leaking matter existence).

## Error Contract

Map backend errors to specific pane states: 402 (`quota_exceeded` / `legal_tool_monthly_limit` / `premium_quota_exceeded`) -> show remaining usage from `GET /legal-tools/usage` + upgrade prompt; 413 `document_too_large` (carries `limit_chars`) -> suggest reviewing a selection, and pre-check the 200,000-char cap before posting; 422 -> surface the legal-validity rejection reason; 401 -> silent refresh + one retry, membership 401 -> org picker; a stream that ends without `done` is treated as failure and retried (de-dup on `clientMessageId`).

## Reused Backend Endpoints (no backend change)

Contract review (`/legal-tools/contract-review` + `/stream`, `/contract-review/deep`, `/redline/draft-fix`, durable sign-off trio), analysis tools (`/nda-triage`, `/risk-assessment`, `/compliance-check`, `/canned-response`, `/plain-english`), exports (`/export-corrected` tracked-changes DOCX, `/export` PDF/DOCX), playbooks (`/playbooks`, `/defaults`, `/templates`, `/from-template`, `/extract-from-docx`), drafting (`/drafting/generate`, `/clause/rewrite`, `/clause/explain`, `/classify`, `/import`), chat (`POST /api/v1/stream/chat`), usage (`GET /legal-tools/usage`), learning loop (`/redline-decisions`, `/learning-suggestions`, `/learning/apply`). The one genuinely new endpoint worth adding (not blocking) is a structured change-set return (ranges + replacement text) so the pane can apply edits fully in place.

## Config, Manifest, Hosting

- `src/config.ts`: `apiBase`/`appBase` fixed by `import.meta.env.PROD`; Supabase URL + public anon key injected at build (Docker build args). The client bundle holds **no secrets**. `service_role` key must never appear here.
- Manifest: add-in-only XML (`manifest.xml` prod, `manifest.dev.xml` sideload), not the unified JSON manifest (JSON drops perpetual Office, Outlook on Mac, mobile). Requirement floor WordApi 1.6; feature-detect 1.7 to 1.9. List every navigated domain in `<AppDomains>`.
- Hosting: static HTTPS, real cert. CSP `script-src` allows `https://appsforoffice.microsoft.com`; `connect-src` includes `api.vaquill.ai` + Supabase origins; `frame-ancestors` permits the Office web hosts; never send `X-Frame-Options: DENY`. Ribbon icons must stay cacheable (no `no-store`).

## Writing Style

Never use em dashes. Use plain dashes, periods, or commas. No emojis (lucide-style inline SVG icons in `src/ui/icons.tsx` are fine). US spelling. White theme only. Immutability: create new objects, do not mutate. Small, cohesive files. Validate user input.

## Working Rules (repo-specific)

- Reuse the shared `src/ui/` primitives and `src/office/` helpers before writing new ones. Do not add a second `Word.run` path outside `src/office/`.
- Never name third-party model or infrastructure providers in customer-facing copy. Do not re-add any removed case-law attribution labels.
- Do not commit, push, or amend without an explicit per-turn request.
- There is significant uncommitted work in progress (a Research surface, Templates, assistant attachments, context ingest). Check `git status` before assuming a feature is or is not landed.
