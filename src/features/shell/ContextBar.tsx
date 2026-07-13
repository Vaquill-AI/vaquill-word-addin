import { useEffect, useState } from "react";
import { useAppNav } from "@/app/nav";
import { useSelection } from "@/features/tools/useSelection";
import { getReviewPrefs, subscribeReviewPrefs } from "@/lib/prefs";
import { JURISDICTIONS, labelOf } from "@/features/review/constants";
import { listMatters, type Matter } from "@/api/platform";
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
  const [matters, setMatters] = useState<Matter[] | null>(null);
  useEffect(() => subscribeReviewPrefs(setPrefs), []);
  useEffect(() => {
    let alive = true;
    listMatters()
      .then((m) => alive && setMatters(m))
      .catch(() => alive && setMatters([]));
    return () => {
      alive = false;
    };
  }, []);

  // The standing context always resolves to something, so it is always shown:
  // the general workspace defaults to "General matter" (matterId ""), and a
  // chosen matter shows its real name (not the literal word "matter").
  const matter = prefs.matterId ? matters?.find((m) => m.id === prefs.matterId) : null;
  const matterLabel = prefs.matterId ? matter?.name ?? "Matter" : "General matter";

  // The Assistant tab has richer inline selection tools. Show selection verbs on
  // the other working tabs (review / draft / research / playbook / tools).
  const showSelection = sel.hasSelection && tab !== "assistant";

  return (
    <div className="context-bar">
      <button
        type="button"
        className="context-bar__ctx"
        onClick={onOpenSettings}
        title="Change in Settings"
      >
        <span className="context-bar__ctx-label">
          {labelOf(JURISDICTIONS, prefs.jurisdiction)} · {matterLabel}
        </span>
      </button>

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
