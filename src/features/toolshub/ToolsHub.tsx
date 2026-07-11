import { useState, type ReactNode } from "react";
import { Button } from "@/ui/primitives";
import { ArrowLeftIcon, ShieldCheckIcon, RedactIcon, FillIcon, EditIcon, CopyIcon } from "@/ui/icons";
import { ToolCard, ToolCardList } from "@/ui/ToolCard";
import { ComplianceView } from "@/features/compliance/ComplianceView";
import { RedactView } from "@/features/redact/RedactView";
import { FillView } from "@/features/fill/FillView";
import { EditView } from "@/features/edit/EditView";
import { TransplantView } from "@/features/transplant/TransplantView";
import "./toolshub.css";

type ToolKey = "compliance" | "redact" | "fill" | "edit" | "transplant";

interface ToolDef {
  key: ToolKey;
  title: string;
  description: string;
  icon: ReactNode;
  view: ReactNode;
}

const TOOLS: ToolDef[] = [
  {
    key: "compliance",
    title: "Compliance",
    description: "Check the document against a regulation or your own guideline questions.",
    icon: <ShieldCheckIcon size={18} />,
    view: <ComplianceView />,
  },
  {
    key: "redact",
    title: "Redact",
    description: "Find and permanently remove sensitive information from the document.",
    icon: <RedactIcon size={18} />,
    view: <RedactView />,
  },
  {
    key: "fill",
    title: "Fill from reference",
    description: "Fill this template's placeholders from a reference document.",
    icon: <FillIcon size={18} />,
    view: <FillView />,
  },
  {
    key: "edit",
    title: "Edit document",
    description: "Describe changes in plain English and get grounded redlines across the document.",
    icon: <EditIcon size={18} />,
    view: <EditView />,
  },
  {
    key: "transplant",
    title: "Clause transplant",
    description: "Pull a clause from another contract and insert it into this document.",
    icon: <CopyIcon size={18} />,
    view: <TransplantView />,
  },
];

/**
 * Launcher for the document-level tools, so they share one top-level tab instead
 * of one tab each. Pick a tool to open it; a back control returns to the grid.
 */
export function ToolsHub() {
  const [selected, setSelected] = useState<ToolKey | null>(null);
  const active = TOOLS.find((t) => t.key === selected);

  if (active) {
    return (
      <div className="stack toolshub-tool">
        <Button
          variant="default"
          size="sm"
          onClick={() => setSelected(null)}
          style={{ alignSelf: "flex-start" }}
          aria-label="Back to tools"
        >
          <ArrowLeftIcon size={14} /> Tools
        </Button>
        {active.view}
      </div>
    );
  }

  return (
    <div className="stack toolshub">
      <div className="stack" style={{ gap: 4 }}>
        <h1 className="view-title">Tools</h1>
        <p className="small muted" style={{ margin: 0 }}>
          Document analysis and utilities.
        </p>
      </div>
      <ToolCardList>
        {TOOLS.map((t) => (
          <ToolCard
            key={t.key}
            icon={t.icon}
            title={t.title}
            description={t.description}
            onClick={() => setSelected(t.key)}
          />
        ))}
      </ToolCardList>
    </div>
  );
}
