/// <reference types="vite/client" />

interface ImportMetaEnv {
  // The only build-injected values. Everything else is committed or derived
  // (see src/config.ts).
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
