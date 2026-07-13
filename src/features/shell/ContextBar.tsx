import { useAppNav } from "@/app/nav";
import { useSelection } from "@/features/tools/useSelection";
import "./context-bar.css";

/**
 * Persistent shell strip for cross-feature selection actions.
 *
 * When text is selected (and not on the Assistant tab, which has its own inline
 * selection tools), it shows verbs that act on the selection by routing to the
 * surface that owns each action - the "select a clause, act on it from anywhere"
 * unifier. Renders nothing when there is no selection, so it costs no vertical
 * space in the common case.
 */
export function ContextBar() {
  const { tab, navigate } = useAppNav();
  const sel = useSelection();

  // The Assistant tab has richer inline selection tools; show these verbs on the
  // other working tabs (review / draft / research / playbook / tools).
  const showSelection = sel.hasSelection && tab !== "assistant";
  if (!showSelection) return null;

  return (
    <div className="context-bar">
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
    </div>
  );
}
