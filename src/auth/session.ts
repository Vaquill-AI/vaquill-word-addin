import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/**
 * In-memory session store. Holds the Supabase access + refresh tokens for the
 * life of the task pane. Refreshes the access token before it expires so every
 * backend request carries a fresh bearer.
 *
 * Deliberately no persistence: tokens never touch localStorage or Office
 * Settings. On add-in reload the user re-authenticates via the dialog, which is
 * near-instant when the Supabase refresh cookie in the dialog webview is valid.
 */
type Listener = (user: User | null) => void;

const REFRESH_SKEW_SECONDS = 60;

let session: Session | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  const user = session?.user ?? null;
  for (const l of listeners) l(user);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(session?.user ?? null);
  return () => listeners.delete(listener);
}

export function getUser(): User | null {
  return session?.user ?? null;
}

export function isAuthenticated(): boolean {
  return !!session?.access_token;
}

/** Seed the store from tokens handed back by the auth dialog. */
export async function setSessionFromTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const { data, error } = await getSupabase().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  session = data.session;
  notify();
}

export function clearSession(): void {
  session = null;
  void getSupabase().auth.signOut({ scope: "local" });
  notify();
}

function isExpiringSoon(s: Session): boolean {
  if (!s.expires_at) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return s.expires_at - nowSeconds <= REFRESH_SKEW_SECONDS;
}

/**
 * Return a valid access token, refreshing first if it is close to expiry.
 * Returns null when there is no session or refresh failed (caller re-auths).
 */
export async function getAccessToken(): Promise<string | null> {
  if (!session) return null;
  if (isExpiringSoon(session)) {
    return refresh();
  }
  return session.access_token;
}

/** Force a refresh (used on a 401 as a one-shot retry). Returns the new token. */
export async function refresh(): Promise<string | null> {
  if (!session?.refresh_token) return null;
  const { data, error } = await getSupabase().auth.refreshSession({
    refresh_token: session.refresh_token,
  });
  if (error || !data.session) {
    clearSession();
    return null;
  }
  session = data.session;
  notify();
  return session.access_token;
}
