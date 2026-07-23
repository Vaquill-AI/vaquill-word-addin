# Deploying Vaquill for Word

The add-in is a static task-pane web app: Word loads it from a public HTTPS URL, so deploying it means hosting the built bundle somewhere with HTTPS and pointing a manifest at it.
There are two very different paths, and most people only need the first:

- **Community edition (your own key)** — static files only.
No server, no database, no backend, no VPS.
This is what almost every self-hoster wants.
See [Self-hosting the community edition](#self-hosting-the-community-edition-bring-your-own-key).
- **Hosted build (the Vaquill product)** — the build that talks to the Vaquill backend + Supabase, served at `word.vaquill.ai` via Docker + nginx on Dokploy.
Only Vaquill (or someone standing up the full hosted stack) needs this.
See [Hosting the full hosted build](#hosting-the-full-hosted-build).

---

## Self-hosting the community edition (bring your own key)

This is the simplest path and it needs no server.
The community build is a folder of static files: your firm runs the add-in on its own OpenAI or Anthropic key, with no Vaquill backend, no database, and nothing to keep running.

**You do NOT need** a VPS, Docker, nginx, Supabase, a backend, or any of the hosted-build setup further down.
The only hard requirement is a host that serves the files over HTTPS (Office refuses to load an add-in over plain HTTP).

### 1. Build the static bundle

```bash
npm install
npm run build:community    # outputs dist/ -- the whole app as static files
```

### 2. Put `dist/` on any static host with HTTPS

Every option below gives free, automatic HTTPS.
Pick whichever you already use; there is no server to run or patch.

| Host | How |
| --- | --- |
| Cloudflare Pages | `npx wrangler pages deploy dist` (or connect the repo: build command `npm run build:community`, output directory `dist`) |
| Netlify | `netlify deploy --prod --dir dist`, or drag the `dist/` folder into the dashboard |
| Vercel | `vercel deploy --prod` with the output directory set to `dist` |
| GitHub Pages | publish `dist/` to a `gh-pages` branch (HTTPS is on by default for `*.github.io`) |
| S3 + CloudFront | upload `dist/` to a bucket and put CloudFront in front for HTTPS |

Note the resulting URL, for example `https://vaquill.yourfirm.com` or the host's `*.pages.dev` / `*.netlify.app` domain.

### 3. Point a manifest at your URL

Copy `manifest.community.xml` and, in the copy:

- Replace every `YOUR-DOMAIN.example.com` with your host from step 2.
- Replace the `<Id>` GUID with a new unique one (generate at https://guidgenerator.com) so your install never collides with anyone else's.

### 4. Hand the manifest to each person

Each user sideloads that one manifest (see the sideload steps in the [README](README.md#run-it-yourself-community-edition)) and pastes their own API key in the pane.
That is the whole deployment: static files on an HTTPS URL plus a manifest.
No account, no backend, nothing to operate.

To ship an update, rebuild `dist/` and re-upload.
Users only need to re-sideload if the manifest itself changed (a new domain or id); a content-only update is picked up automatically.

---

## Hosting the full hosted build

Everything below is for deploying **Vaquill's own hosted product**: the build that uses the Vaquill backend + Supabase, served at `word.vaquill.ai`.
If you are self-hosting the community edition, you can stop here — none of the Docker, nginx, Supabase, Dokploy, or backend-CORS steps apply to you.

## What actually gets deployed

- **This repo** builds to static files and is served by the rootless nginx in the [Dockerfile](Dockerfile). Host it at `word.vaquill.ai`.
- **The backend** (the Vaquill API, already running at `api.vaquill.ai`) needs exactly one change: allow the add-in origin through CORS.
- **The manifest** ([manifest.xml](manifest.xml)) is already production-shaped (it points at `word.vaquill.ai` and `api.vaquill.ai`). You sideload it to test, then submit it to AppSource later.

## Configuration model

Nothing in a client bundle can be secret: everything ships to the browser.
So the config is split by *what varies*, not by secrecy (see [src/config.ts](src/config.ts)):

| Value | Where it comes from | Why |
| --- | --- | --- |
| API base | committed, chosen by build mode | fixed per environment (`localhost:8000` dev, `api.vaquill.ai` prod) |
| Add-in origin | `window.location.origin` at runtime | the pane is served from its own origin, so it cannot be set wrong |
| Supabase URL + anon key | Docker build args | one public project identifier, kept out of git history and rotatable without a code change |

The Supabase anon key is public by design (Row Level Security protects the data).
The `service_role` key is the real secret and must never appear in this repo, the bundle, or a build arg.

## 1. Build args

The image needs two build args (the Supabase project URL and its public anon key):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<public anon key>
```

Local test of the exact production image:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://<your-project>.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon-key> \
  -t vaquill-word-addin .
docker run --rm -p 8080:8080 vaquill-word-addin
# then open http://localhost:8080/health  -> "ok"
```

## 2. Dokploy application

1. Create a new **Application** in Dokploy, source = this Git repository, branch `main`.
2. Build type = **Dockerfile** (Dokploy uses the [Dockerfile](Dockerfile) at the repo root).
3. Under **Environment / Build Args**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   Store them as build args (they are consumed at build time, not runtime).
4. The container listens on **8080** (rootless nginx). Point the app's internal port at `8080`.
5. Add a **Domain**: `word.vaquill.ai`, container port `8080`, HTTPS on, certificate provider **Let's Encrypt**.
   Traefik terminates TLS and proxies to nginx over plain HTTP inside the network.
6. Health check path: `/health`.
7. Deploy.

Point `word.vaquill.ai` DNS at the Dokploy host before the certificate can be issued.

## 3. Backend CORS (one change, separate deploy)

The add-in calls `api.vaquill.ai` from the `https://word.vaquill.ai` origin, so that origin must be allowed by CORS on the backend.
Add it to the FastAPI CORS allowlist (`CORSMiddleware` `allow_origins`) in the backend repo:

```
https://word.vaquill.ai
```

That is the only backend change.
Redeploy the backend after adding it.
Do not use a wildcard `*` origin: the add-in sends the Supabase bearer, so the allowlist must be explicit.

## 4. Sideload and smoke-test in a real Word host

The preview harness cannot exercise Office.js, so this is where the add-in is really validated.

1. Validate the manifest: `npm run validate:manifest`.
2. Sideload `manifest.xml` (now pointing at the live `word.vaquill.ai`):
   - **Word desktop**: Insert > Add-ins > My Add-ins > Upload My Add-in, pick `manifest.xml`.
   - **Word on the web**: Insert > Add-ins > Upload My Add-in.
3. Open the pane and walk the core flows against a real `.docx`: sign in, review, apply a tracked-change redline, triage counterparty changes, citation check, record sign-off, draft.

Test **both** desktop (WebView host) and Word on the web (iframe host): the CSP `frame-ancestors` and framing behavior only matter on the web host.

## 5. Verify the Content Security Policy in-host

The CSP in [deploy/nginx.conf](deploy/nginx.conf) keeps `script-src` strict (only `self` plus the Office CDNs, no `unsafe-eval` / `unsafe-inline`).
Some office.js paths have historically needed `eval`.
If, while sideloaded, the pane is blank and the host console shows a CSP error naming `eval` or `appsforoffice.microsoft.com`:

1. Add `'unsafe-eval'` to `script-src` in [deploy/nginx.conf](deploy/nginx.conf).
2. Only if it still fails, add `'unsafe-inline'` to `script-src` as well.
3. Redeploy and retest.

Relax `script-src` only as far as the host actually requires, and never loosen `object-src` or `frame-ancestors`.
The only intentional `connect-src` entries beyond our own API + Supabase + Office are the bring-your-own-key hosts the pane calls directly from the browser: `api.openai.com`, `api.anthropic.com`, and `www.courtlistener.com`.
These are fixed, well-known API hosts reached only on the BYOK path; do not add wildcards or other hosts.

## Security posture (summary)

- Rootless nginx (uid 101), non-privileged port 8080, `server_tokens off`.
- HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and a locked-down `Permissions-Policy` on every response.
- Strict CSP: `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `connect-src` limited to our API + the Supabase project + Office + the BYOK provider hosts (`api.openai.com`, `api.anthropic.com`, `www.courtlistener.com`), and a `frame-ancestors` allowlist for the Office web hosts (no `X-Frame-Options`, which cannot express those origins).
- Source maps are stripped from the image and 404 if requested; dotfiles are denied.
- TLS is mandatory (Office requires HTTPS) and terminated by Traefik with an auto-renewing Let's Encrypt certificate.
- No secrets in the bundle: only the public Supabase anon key, which RLS backs; the auth session is held in memory only and never written to `localStorage` or the Office Settings object.
