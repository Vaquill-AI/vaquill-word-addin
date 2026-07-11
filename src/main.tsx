import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { isAuthCallback, relayAuthCallback } from "./auth/relay";
import { initActiveOrg } from "./lib/org";
import { assertConfigured } from "./config";
import { isWordHost } from "./office/run";
import "./styles/global.css";

/**
 * Boot the task pane. We wait for Office.onReady so Office.js is initialized
 * before React touches any Office API, then mount the app.
 */
Office.onReady(() => {
  // OAuth callback fallback: Supabase redirects the sign-in dialog to
  // /auth.html, but when the exact redirect path isn't allow-listed it falls
  // back to the Site URL (this page, at the root) with the code in the query.
  // Detect that, relay the code to the pane, and stop — do NOT render the full
  // app inside the dialog (which would show a duplicate screen and try to open
  // a nested dialog).
  const callbackParams = new URLSearchParams(window.location.search);
  if (isAuthCallback(callbackParams)) {
    relayAuthCallback(callbackParams);
    return;
  }

  // Restore the persisted active organization before any API call so requests
  // are scoped correctly from the first fetch.
  initActiveOrg();

  const root = createRoot(document.getElementById("root")!);
  if (!isWordHost()) {
    root.render(
      <div style={{ padding: 16 }}>
        <p>Vaquill AI for Word runs inside Microsoft Word.</p>
      </div>,
    );
    return;
  }
  // Fail loudly and clearly if the build was shipped without its config, rather
  // than crashing deep inside the Supabase client with a cryptic message.
  try {
    assertConfigured();
  } catch (e) {
    root.render(
      <div style={{ padding: 16 }}>
        <p>Vaquill AI for Word is not configured correctly.</p>
        <p style={{ color: "#a4262c", fontSize: 12 }}>{(e as Error).message}</p>
      </div>,
    );
    return;
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
