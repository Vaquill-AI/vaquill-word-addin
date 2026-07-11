import { useEffect, useState } from "react";
import { useAppNav } from "@/app/nav";
import { useSelection } from "@/features/tools/useSelection";
import { getReviewPrefs, subscribeReviewPrefs } from "@/lib/prefs";
import { JURISDICTIONS, labelOf } from "@/features/review/constants";
import "./context-bar.css";

/**
 * Persistent shell strip that ties the tabs into one session.
 *
 * Left: the user's standing context (jurisdiction + whether a matter is set),
 * so it never has to be re-picked per tab; click to edit it in Settings.
 *
 * Right (only when text is selected, and not on the Assistant tab which has its
 * own inline selection tools): cross-feature verbs that act on the selection by
 * routing to the surface that owns each action. This is the "select a clause,
 * act on it from anywhere" unifier.
 *
 * Renders nothing when there is neither context to show nor a selection to act
 * on, so it costs no vertical space in the common case.
 */
export function ContextBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { tab, navigate } = useAppNav();
  const sel = useSelection();
  const [prefs, setPrefs] = useState(getReviewPrefs());
  useEffect(() => subscribeReviewPrefs(setPrefs), []);

  const hasContext = Boolean(prefs.jurisdiction || prefs.matterId);
  // The Assistant tab has richer inline selection tools; Home is a cockpit. Show
  // selection verbs on the working tabs (review / draft / playbook / tools).
  const showSelection = sel.hasSelection && tab !== "assistant" && tab !== "home";

  if (!hasContext && !showSelection) return null;

  return (
    <div className="context-bar">
      {hasContext && (
        <button
          type="button"
          className="context-bar__ctx"
          onClick={onOpenSettings}
          title="Change in Settings"
        >
          <span className="context-bar__ctx-label">
            {labelOf(JURISDICTIONS, prefs.jurisdiction)}
            {prefs.matterId ? " · matter" : ""}
          </span>
        </button>
      )}

      {showSelection && (
        <div className="context-bar__sel">
          <span className="context-bar__sel-count">
            {sel.words} word{sel.words === 1 ? "" : "s"} selected
          </span>
          <div className="context-bar__actions">
            <button
              type="button"
              className="context-bar__verb"
              onClick={() =>
                navigate("assistant", { kind: "assistantAsk", prompt: "", scope: "selection" })
              }
            >
              Ask
            </button>
            <button
              type="button"
              className="context-bar__verb"
              onClick={() => navigate("assistant", { kind: "selectionTool", tool: "explain" })}
            >
              Explain
            </button>
            <button
              type="button"
              className="context-bar__verb"
              onClick={() => navigate("assistant", { kind: "selectionTool", tool: "risk" })}
            >
              Risk
            </button>
            <button
              type="button"
              className="context-bar__verb"
              onClick={() => navigate("assistant", { kind: "selectionTool", tool: "rewrite" })}
            >
              Rewrite
            </button>
            <button
              type="button"
              className="context-bar__verb"
              onClick={() => navigate("tools", { kind: "openTool", tool: "redact" })}
            >
              Redact
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
