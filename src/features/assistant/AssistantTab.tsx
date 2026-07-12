import { useEffect, useState } from "react";
import { SegmentedControl } from "@/ui/primitives";
import type { AppIntent } from "@/app/nav";
import { AssistantView } from "./AssistantView";
import { EditView } from "@/features/edit/EditView";
import "./assistant-tab.css";

type Mode = "ask" | "edit";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "ask", label: "Ask" },
  { value: "edit", label: "Edit" },
];

/**
 * The Assistant tab hosts two ways to work with the open document conversationally:
 * "Ask" (grounded chat) and "Edit" (describe a change in plain English, get
 * grounded redlines). They were separate surfaces (a tab and a Tools entry) that
 * are the same job from two doors; this folds them under one tab with a toggle.
 *
 * A thin wrapper on purpose: neither the chat nor the edit view changes; the tab
 * only owns the toggle and gives each the full remaining height. A cross-feature
 * handoff (ask this / open a selection tool) forces Ask mode so the chat receives it.
 */
export function AssistantTab({
  intent,
  onIntentDone,
}: {
  intent?: AppIntent | null;
  onIntentDone?: () => void;
} = {}) {
  const [mode, setMode] = useState<Mode>("ask");

  useEffect(() => {
    if (intent?.kind === "assistantAsk" || intent?.kind === "selectionTool") setMode("ask");
  }, [intent]);

  return (
    <div className="assistant-tab">
      <div className="assistant-tab__toggle">
        <SegmentedControl<Mode>
          label="Assistant mode"
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
        />
      </div>
      {mode === "ask" ? (
        <div className="assistant-tab__body">
          <AssistantView intent={intent} onIntentDone={onIntentDone} />
        </div>
      ) : (
        <div className="assistant-tab__body assistant-tab__body--pad">
          <EditView />
        </div>
      )}
    </div>
  );
}
