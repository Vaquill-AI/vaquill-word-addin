import { useEffect, useRef } from "react";
import { LiveRegion } from "@/ui/primitives";
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

  const focusingSelection = scope === "selection" && hasSelection;
  // The toggle can only "Focus selection" when there is a selection to focus.
  const toggleDisabled = !focusingSelection && !hasSelection;

  return (
    <div className={`focus-control${focusingSelection ? " focus-control--selection" : ""}`}>
      <span className="focus-control__icon" aria-hidden>
        {focusingSelection ? <SelectionGlyph /> : <DocGlyph />}
      </span>
      <LiveRegion className="focus-control__label">
        <span className="small">
          {focusingSelection ? (
            <>
              Focusing on the <strong>selected text</strong>
              {words > 0 ? ` · ${words} word${words === 1 ? "" : "s"}` : ""}
            </>
          ) : (
            <>
              Focusing on the <strong>whole document</strong>
            </>
          )}
        </span>
      </LiveRegion>
      <button
        type="button"
        className="focus-control__toggle"
        onClick={() => onScope(focusingSelection ? "document" : "selection")}
        disabled={toggleDisabled}
      >
        {focusingSelection ? "Use whole document" : "Focus selection"}
      </button>
    </div>
  );
}
