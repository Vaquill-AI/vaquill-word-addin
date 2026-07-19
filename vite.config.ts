import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

// App version, injected as __APP_VERSION__ so telemetry/support can report which
// build is running without importing package.json into the client bundle.
const pkgVersion = (
  JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version?: string }
).version ?? "0.0.0";

// Local HTTPS for the dev server (Office requires HTTPS, even on localhost).
// Order: explicit cert paths from env (office-addin-debugging sets these), then
// the certificate created by `npx office-addin-dev-certs install` (the community
// self-host flow uses this so `npm run dev:community` just works), then none.
function devHttps() {
  if (process.env.WORD_ADDIN_KEY && process.env.WORD_ADDIN_CERT) {
    return { key: process.env.WORD_ADDIN_KEY, cert: process.env.WORD_ADDIN_CERT };
  }
  const dir = resolve(homedir(), ".office-addin-dev-certs");
  const keyPath = resolve(dir, "localhost.key");
  const certPath = resolve(dir, "localhost.crt");
  if (existsSync(keyPath) && existsSync(certPath)) {
    return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  }
  return undefined;
}

// The add-in ships three HTML entry points served from the same origin:
//   index.html      the task pane SPA
//   auth.html       the Supabase PKCE redirect page opened inside the Office dialog
//   dictation.html  the microphone dialog (the pane iframe cannot get the mic)
// Office requires HTTPS in production; local dev uses the office-addin dev certs.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  server: {
    port: 3000,
    https: devHttps(),
  },
  build: {
    outDir: "dist",
    // No source maps in production: nginx blocks .map (return 404), so shipping
    // a bundle that references one just produces console/log 404 noise on every
    // load. This thin client has no server-side error reporting that needs them.
    sourcemap: false,
    rollupOptions: {
      input: {
        taskpane: resolve(__dirname, "index.html"),
        auth: resolve(__dirname, "auth.html"),
        dictation: resolve(__dirname, "dictation.html"),
        // preview.html is a local UI harness served by `npm run dev`; it is
        // intentionally excluded from the production build.
      },
    },
  },
});
