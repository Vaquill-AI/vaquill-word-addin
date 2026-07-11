import type { DialogPayload } from "./dialog-login";

/**
 * Relay an OAuth callback from the Office sign-in DIALOG back to the task pane.
 *
 * Critical: we do NOT exchange the authorization code here. This code runs in
 * the dialog's browser context, but the PKCE code_verifier was generated and
 * stored by `signInWithOAuth` in the TASK PANE's Supabase client (a separate
 * context with no shared storage, since the client is in-memory only). So the
 * dialog can only forward the raw `code`; the pane completes the exchange where
 * the verifier actually lives (see auth/dialog-login.ts). Exchanging here fails
 * with "PKCE code verifier not found in storage".
 *
 * Used by both entry points that a Supabase redirect can land on:
 *   - auth.html (the intended redirect target), and
 *   - index.html at the site root (Supabase falls back to the Site URL when the
 *     exact redirect path isn't allow-listed), so the main app must relay too.
 */
export function relayAuthCallback(params: URLSearchParams): void {
  const send = (payload: DialogPayload) => {
    try {
      Office.context.ui.messageParent(JSON.stringify(payload));
    } catch {
      // Not running inside a dialog (e.g. the URL was opened directly). Nothing
      // to relay to.
    }
  };

  const errorDescription = params.get("error_description") ?? params.get("error");
  if (errorDescription) {
    send({ ok: false, error: errorDescription });
    return;
  }

  const code = params.get("code");
  if (!code) {
    send({ ok: false, error: "No authorization code was returned." });
    return;
  }

  send({ ok: true, code });
}

/** True when the current URL carries an OAuth callback (code or error). */
export function isAuthCallback(params: URLSearchParams): boolean {
  return Boolean(params.get("code") || params.get("error") || params.get("error_description"));
}
