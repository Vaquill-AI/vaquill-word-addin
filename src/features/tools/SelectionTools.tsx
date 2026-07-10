import { useState } from "react";
import { SegmentedControl } from "@/ui/primitives";
import { useSelection } from "./useSelection";
import { SelectionPreview } from "./SelectionPreview";
import { RewriteTool } from "./RewriteTool";
import { ExplainTool } from "./ExplainTool";
import "./tools.css";

type Tool = "rewrite" | "explain";

/**
 * Selection-aware clause tools, embedded contextually (in the Assistant).
 * Renders nothing until the user selects text in the document, then offers
 * Rewrite / Explain on that selection. This replaces the old standalone Tools
 * tab: clause tools are a selection action, not a top-level mode.
 */
export function SelectionTools() {
  const sel = useSelection();
  const [tool, setTool] = useState<Tool>("rewrite");

  if (!sel.hasSelection) return null;

  return (
    <div className="selection-tools">
      <SelectionPreview text={sel.text} words={sel.words} hasSelection loading={false} />
      <SegmentedControl<Tool>
        value={tool}
        onChange={setTool}
        options={[
          { value: "rewrite", label: "Rewrite" },
          { value: "explain", label: "Explain" },
        ]}
      />
      {tool === "rewrite" ? (
        <RewriteTool key={sel.text} clauseText={sel.text} />
      ) : (
        <ExplainTool key={sel.text} clauseText={sel.text} />
      )}
    </div>
  );
}
