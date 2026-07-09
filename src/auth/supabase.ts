import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/config";

/**
 * A single Supabase client instance for the add-in.
 *
 * Storage note: inside the Office auth dialog we use PKCE and hand the tokens
 * to the task pane via messageParent (see auth/redirect.ts). The task pane then
 * seeds this client's session with setSession(). We keep the session in memory
 * only; we never persist tokens to localStorage or the Office Settings object,
 * because Settings serializes into the .docx and travels with the file.
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
