import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The add-in ships two HTML entry points served from the same origin:
//   index.html    the task pane SPA
//   auth.html     the Supabase PKCE redirect page opened inside the Office dialog
// Office requires HTTPS in production; local dev uses the office-addin dev certs.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  server: {
    port: 3000,
    // office-addin-debugging injects the dev certificate paths via env.
    https:
      process.env.WORD_ADDIN_KEY && process.env.WORD_ADDIN_CERT
        ? {
            key: process.env.WORD_ADDIN_KEY,
            cert: process.env.WORD_ADDIN_CERT,
          }
        : undefined,
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
        // preview.html is a local UI harness served by `npm run dev`; it is
        // intentionally excluded from the production build.
      },
    },
  },
});
