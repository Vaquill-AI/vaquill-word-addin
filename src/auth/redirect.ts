import { relayAuthCallback } from "./relay";

/**
 * Entry point for auth.html, which runs inside the Office sign-in dialog.
 * Supabase redirects here with the PKCE authorization code. We do NOT exchange
 * it here: the code_verifier lives in the task pane's Supabase client, a
 * separate browser context with no shared storage. We relay the raw code back
 * to the pane via messageParent; the pane performs the exchange where the
 * verifier exists (see auth/dialog-login.ts). Exchanging in the dialog fails
 * with "PKCE code verifier not found in storage".
 */
Office.onReady(() => {
  relayAuthCallback(new URLSearchParams(window.location.search));
});
