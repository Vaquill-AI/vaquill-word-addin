import { useEffect, useState } from "react";
import { useSelection } from "./useSelection";
import { SelectionPreview } from "./SelectionPreview";
import { RewriteTool } from "./RewriteTool";
import { ExplainTool } from "./ExplainTool";
import { PlainEnglishTool } from "./PlainEnglishTool";
import { RiskTool } from "./RiskTool";
import { ComplianceTool } from "./ComplianceTool";
import "./tools.css";

type Tool = "rewrite" | "explain" | "plain" | "risk" | "compliance";

const TOOLS: { key: Tool; label: string }[] = [
  { key: "rewrite", label: "Rewrite" },
  { key: "explain", label: "Explain" },
  { key: "plain", label: "Plain English" },
  { key: "risk", label: "Legal risks" },
  { key: "compliance", label: "Compliance" },
];

/**
 * Selection-aware clause tools, embedded contextually (in the Assistant).
 * Renders nothing until the user selects text in the document. The one-shot
 * analysis tools (Plain English, Legal risks, Compliance) are backed by the
 * dedicated structured endpoints and render scored / checklist output, rather
 * than routing to free-text chat.
 */
export function SelectionTools({ initialTool }: { initialTool?: Tool } = {}) {
  const sel = useSelection();
  const [tool, setTool] = useState<Tool>(initialTool ?? "rewrite");

  // A shell handoff ("Explain this selection") can preselect a tool.
  useEffect(() => {
    if (initialTool) setTool(initialTool);
  }, [initialTool]);

  if (!sel.hasSelection) {
    // During normal chat, stay out of the way. But when the user explicitly
    // opened a selection tool (shell handoff) with nothing selected, show the
    // guidance empty state rather than a blank pane.
    if (!initialTool) return null;
    return (
      <div className="selection-tools">
        <SelectionPreview text="" words={0} hasSelection={false} loading={false} />
      </div>
    );
  }

  return (
    <div className="selection-tools">
      <SelectionPreview text={sel.text} words={sel.words} hasSelection loading={false} />

      <div className="tool-tabs" role="tablist" aria-label="Selection tools">
        {TOOLS.map((t) => {
          const on = t.key === tool;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              className={`chip ${on ? "chip--on" : ""}`}
              onClick={() => setTool(t.key)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tool === "rewrite" && <RewriteTool key={sel.text} clauseText={sel.text} />}
      {tool === "explain" && <ExplainTool key={sel.text} clauseText={sel.text} />}
      {tool === "plain" && <PlainEnglishTool key={sel.text} clauseText={sel.text} />}
      {tool === "risk" && <RiskTool key={sel.text} clauseText={sel.text} />}
      {tool === "compliance" && <ComplianceTool key={sel.text} clauseText={sel.text} />}
    </div>
  );
}
