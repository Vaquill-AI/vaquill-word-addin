import { useEffect, useRef } from "react";
import { useSelection } from "@/features/tools/useSelection";
import type { Scope } from "./useAssistant";
import "./focus-control.css";

/**
 * Live indicator of what the assistant will answer about, replacing a blind
 * scope dropdown.
 *
 * Behavior (auto-follow selection, matching the tools pane and StrongSuit's
 * "Document Context" pattern): when the user selects text the focus follows the
 * selection; when they clear it, focus reverts to the whole document. A manual
 * override via the toggle sticks until the next selection change, so the user is
 * never fighting the control. The effective scope is always visible, so nothing
 * is hidden.
 */
function DocGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8" />
    </svg>
  );
}

function SelectionGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
      <path d="M9 9h6v6H9z" />
    </svg>
  );
}

export function FocusControl({
  scope,
  onScope,
}: {
  scope: Scope;
  onScope: (scope: Scope) => void;
}) {
  const { hasSelection, words, loading } = useSelection();
  // null until the first selection read resolves, then the prior hasSelection so
  // we only react to genuine transitions (not every re-render).
  const prevHasSelection = useRef<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    const prev = prevHasSelection.current;
    if (prev === hasSelection) return; // no transition
    prevHasSelection.current = hasSelection;
    if (prev === null) {
      // First resolve: only override the whole-document default if text is
      // already selected; otherwise leave the parent's scope as-is.
      if (hasSelection) onScope("selection");
      return;
    }
    onScope(hasSelection ? "selection" : "document");
  }, [hasSelection, loading, onScope]);

  // With no selection the assistant already defaults to the whole document, so
  // the chip would just be permanent "Whole doc" noise. Only surface it once
  // there IS a selection to focus (then it shows "Selection · Nw" and can toggle
  // back to the whole doc).
  if (!hasSelection) return null;

  const focusingSelection = scope === "selection";
  const label = focusingSelection ? `Selection · ${words}w` : "Whole doc";

  // A subtle chip, not a full sentence: icon + short scope + a quiet toggle. The
  // whole chip is the toggle; aria-live announces scope changes for a11y.
  return (
    <button
      type="button"
      onClick={() => onScope(focusingSelection ? "document" : "selection")}
      title={
        focusingSelection
          ? "Answering about your selection. Click to use the whole document."
          : "Answering about the whole document. Select text to focus it."
      }
      aria-label={
        focusingSelection
          ? `Answering about the selection, ${words} words. Activate to use the whole document.`
          : "Answering about the whole document. Select text to focus it."
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        border: "none",
        background: "transparent",
        padding: "2px 2px",
        color: focusingSelection ? "var(--brand)" : "var(--text-muted)",
        cursor: "pointer",
      }}
    >
      <span aria-hidden style={{ display: "inline-flex" }}>
        {focusingSelection ? <SelectionGlyph /> : <DocGlyph />}
      </span>
      <span className="small" aria-live="polite">
        {label}
      </span>
    </button>
  );
}
