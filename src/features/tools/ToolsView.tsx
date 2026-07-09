import { useState } from "react";
import { SegmentedControl } from "@/ui/primitives";
import { useSelection } from "./useSelection";
import { SelectionPreview } from "./SelectionPreview";
import { RewriteTool } from "./RewriteTool";
import { ExplainTool } from "./ExplainTool";
import "./tools.css";

type Tool = "rewrite" | "explain";

/** Selection-aware clause tools. Follows the live document selection. */
export function ToolsView() {
  const sel = useSelection();
  const [tool, setTool] = useState<Tool>("rewrite");

  return (
    <div className="stack tools">
      <div className="stack" style={{ gap: 4 }}>
        <h1 style={{ fontSize: 15 }}>Clause tools</h1>
        <p className="small muted" style={{ margin: 0 }}>
          Rewrite or explain whatever you have selected in the document.
        </p>
      </div>

      <SelectionPreview text={sel.text} words={sel.words} hasSelection={sel.hasSelection} loading={sel.loading} />

      {sel.hasSelection && (
        <>
          <SegmentedControl<Tool>
            value={tool}
            onChange={setTool}
            options={[
              { value: "rewrite", label: "Rewrite" },
              { value: "explain", label: "Explain" },
            ]}
          />
          {/* key on selection so a new selection clears stale results */}
          {tool === "rewrite" ? (
            <RewriteTool key={sel.text} clauseText={sel.text} />
          ) : (
            <ExplainTool key={sel.text} clauseText={sel.text} />
          )}
        </>
      )}
    </div>
  );
}
