/**
 * Runtime configuration for the add-in.
 *
 * A client bundle cannot hold secrets: everything here ships to every user's
 * browser. So the split is by *what varies*, not by secrecy:
 *
 *  - apiBase:      fixed per environment. Committed, chosen by build mode.
 *  - addinOrigin:  the origin we are served from. Derived at runtime, never
 *                  configured, so it cannot be set wrong.
 *  - supabaseUrl / supabaseAnonKey: the one project identifier + its PUBLIC
 *                  anon key. Injected at build time (Docker build args) so they
 *                  stay out of git history and can be rotated without a code
 *                  change. The anon key is safe in a client (Row Level Security
 *                  is what protects data). The service_role key is a real secret
 *                  and MUST NEVER appear in this repo or the bundle.
 */

// Fixed public URL, selected by build mode. No env var needed.
const apiBase = import.meta.env.PROD ? "https://api.vaquill.ai" : "http://localhost:8000";

export const config = {
  apiBase,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  // The add-in is served from its own origin; derive it rather than configure it.
  addinOrigin: typeof window !== "undefined" ? window.location.origin : "",
} as const;

/** URL of the PKCE redirect page opened inside the Office auth dialog. */
export const authRedirectUrl = `${config.addinOrigin}/auth.html`;

export function assertConfigured(): void {
  const missing = (["supabaseUrl", "supabaseAnonKey", "addinOrigin"] as const).filter(
    (k) => !config[k],
  );
  if (missing.length) {
    throw new Error(`Vaquill add-in misconfigured. Missing: ${missing.join(", ")}`);
  }
}
