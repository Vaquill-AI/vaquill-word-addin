/**
 * Runtime configuration, read once from Vite env.
 * No secrets live here beyond the Supabase anon key, which is public by design.
 */
export const config = {
  apiBase: import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ?? "",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  addinOrigin: import.meta.env.VITE_ADDIN_ORIGIN?.replace(/\/$/, "") ?? "",
} as const;

/** URL of the PKCE redirect page opened inside the Office auth dialog. */
export const authRedirectUrl = `${config.addinOrigin}/auth.html`;

export function assertConfigured(): void {
  const missing = Object.entries(config)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Vaquill add-in misconfigured. Missing env: ${missing.join(", ")}`);
  }
}
