import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/config";

/**
 * A single Supabase client instance for the add-in.
 *
 * Storage note: inside the Office auth dialog we use PKCE and hand the tokens
 * to the task pane via messageParent (see auth/redirect.ts). The task pane then
 * seeds this client's session with setSession(). We keep persistSession:false so
 * supabase-js never writes the full session (including the access token) to
 * storage on its own. The access token lives in memory only. The one thing we
 * do persist, by hand, is the refresh token, in add-in-origin localStorage
 * (sandboxed; does NOT serialize into the .docx) so a pane reload can restore
 * the session silently -- see auth/session.ts. We never use the Office Settings
 * object for auth, because Settings serializes into the .docx and travels with
 * the file.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
