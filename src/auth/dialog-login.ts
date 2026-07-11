import { getSupabase } from "./supabase";
import { setSessionFromTokens } from "./session";
import { authRedirectUrl } from "@/config";

/**
 * Interactive sign-in via the Office Dialog API.
 *
 * Office renders the task pane in a sandboxed iframe, and identity-provider
 * sign-in pages refuse to load in an iframe, so we open a top-level dialog
 * webview instead. The dialog runs Supabase Authorization Code + PKCE, then
 * hands the tokens back to the task pane through messageParent (strings only;
 * the dialog is a separate browser context with no shared storage).
 */
export type DialogPayload =
  | { ok: true; code: string }
  | { ok: false; error: string };

// Hard ceiling on how long the sign-in dialog may stay open with no message or
// close event. Without it, a misconfigured redirect allowlist (the dialog never
// posts a code and the user never closes it) would hang the pane spinner
// forever. Three minutes is generous for a real Google sign-in yet bounded.
const DIALOG_TIMEOUT_MS = 3 * 60 * 1000;

export async function login(): Promise<void> {
  const supabase = getSupabase();

  // Ask Supabase for the provider URL. skipBrowserRedirect keeps us from
  // navigating the task pane; we open the returned URL in the dialog instead.
  // This call also generates the PKCE code_verifier and stores it on THIS
  // (task-pane) client instance.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authRedirectUrl,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data?.url) {
    throw error ?? new Error("Could not start sign-in.");
  }

  // The dialog runs Google sign-in in its own browser context and relays the
  // authorization code back (it has no verifier, so it cannot exchange).
  const payload = await openDialog(data.url);
  if (!payload.ok) throw new Error(payload.error);

  // Exchange the code HERE in the task pane, where signInWithOAuth stored the
  // PKCE code_verifier. Doing this in the dialog fails with "PKCE code verifier
  // not found in storage".
  const { data: exchanged, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(payload.code);
  if (exchangeError || !exchanged.session) {
    throw exchangeError ?? new Error("Could not complete sign-in.");
  }
  await setSessionFromTokens(exchanged.session.access_token, exchanged.session.refresh_token);
}

function openDialog(startUrl: string): Promise<DialogPayload> {
  return new Promise((resolve, reject) => {
    Office.context.ui.displayDialogAsync(
      startUrl,
      { height: 60, width: 30, promptBeforeOpen: false },
      (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          reject(new Error(result.error?.message ?? "Could not open sign-in window."));
          return;
        }
        const dialog = result.value;

        // If neither a message nor a close event arrives (e.g. the redirect URL
        // is not allow-listed, so the dialog can never post its code back), give
        // up rather than spin forever. Cleared by whichever handler fires first.
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            dialog.close();
          } catch {
            // Dialog may already be gone; closing is best-effort.
          }
          reject(
            new Error(
              "Sign-in timed out. Please try again. If it keeps timing out, the sign-in redirect URL may not be allow-listed.",
            ),
          );
        }, DIALOG_TIMEOUT_MS);

        dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          dialog.close();
          try {
            const message = (arg as { message: string }).message;
            resolve(JSON.parse(message) as DialogPayload);
          } catch {
            resolve({ ok: false, error: "Malformed sign-in response." });
          }
        });

        dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          // Fires when the user closes the dialog manually (code 12006).
          resolve({ ok: false, error: "Sign-in was cancelled." });
        });
      },
    );
  });
}
