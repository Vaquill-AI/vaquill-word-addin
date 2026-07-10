import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { assertConfigured } from "./config";
import { isWordHost } from "./office/run";
import "./styles/global.css";

/**
 * Boot the task pane. We wait for Office.onReady so Office.js is initialized
 * before React touches any Office API, then mount the app.
 */
Office.onReady(() => {
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
