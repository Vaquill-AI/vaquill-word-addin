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
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; error: string };

export async function login(): Promise<void> {
  const supabase = getSupabase();

  // Ask Supabase for the provider URL. skipBrowserRedirect keeps us from
  // navigating the task pane; we open the returned URL in the dialog instead.
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

  const payload = await openDialog(data.url);
  if (!payload.ok) throw new Error(payload.error);
  await setSessionFromTokens(payload.accessToken, payload.refreshToken);
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

        dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
          dialog.close();
          try {
            const message = (arg as { message: string }).message;
            resolve(JSON.parse(message) as DialogPayload);
          } catch {
            resolve({ ok: false, error: "Malformed sign-in response." });
          }
        });

        dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
          // Fires when the user closes the dialog manually (code 12006).
          resolve({ ok: false, error: "Sign-in was cancelled." });
        });
      },
    );
  });
}
