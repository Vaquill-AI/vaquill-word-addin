import { getSupabase } from "./supabase";
import type { DialogPayload } from "./dialog-login";

/**
 * Entry point for auth.html, which runs inside the Office sign-in dialog.
 * Supabase redirects here with the auth code; we complete the PKCE exchange,
 * then hand the tokens back to the task pane via messageParent (strings only).
 */
async function complete(): Promise<void> {
  const send = (payload: DialogPayload) => {
    try {
      Office.context.ui.messageParent(JSON.stringify(payload));
    } catch {
      // Not running inside a dialog (e.g. opened directly); nothing to do.
    }
  };

  try {
    const params = new URLSearchParams(window.location.search);
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

    const { data, error } = await getSupabase().auth.exchangeCodeForSession(code);
    if (error || !data.session) {
      send({ ok: false, error: error?.message ?? "Could not complete sign-in." });
      return;
    }

    send({
      ok: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch (e) {
    send({ ok: false, error: (e as Error).message });
  }
}

Office.onReady(() => {
  void complete();
});
