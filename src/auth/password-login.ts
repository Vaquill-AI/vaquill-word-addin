import { getSupabase } from "./supabase";
import { setSessionFromTokens } from "./session";

/**
 * Email + password sign-in.
 *
 * Unlike the Google OAuth flow (auth/dialog-login.ts), this runs ENTIRELY in
 * the task pane: `signInWithPassword` returns the session directly, so there's
 * no Office dialog and no PKCE cross-context relay. Supports users who
 * registered with email and password rather than Google. The backend accepts
 * the resulting Supabase JWT regardless of how the user authenticated.
 */
export async function loginWithPassword(email: string, password: string): Promise<void> {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error || !data.session) {
    throw error ?? new Error("Could not sign in. Check your email and password.");
  }
  await setSessionFromTokens(data.session.access_token, data.session.refresh_token);
}
