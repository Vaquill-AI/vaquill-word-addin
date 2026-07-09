import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
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
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
