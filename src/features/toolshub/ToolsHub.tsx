import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/ui/primitives";
import type { AppIntent } from "@/app/nav";
import {
  ArrowLeftIcon,
  ShieldCheckIcon,
  RedactIcon,
  FillIcon,
  EditIcon,
  CopyIcon,
  CompareIcon,
  CleanIcon,
  ChecklistIcon,
  TermsIcon,
  LinkIcon,
} from "@/ui/icons";
import { ToolCard, ToolCardList } from "@/ui/ToolCard";
import { ComplianceView } from "@/features/compliance/ComplianceView";
import { RedactView } from "@/features/redact/RedactView";
import { FillView } from "@/features/fill/FillView";
import { EditView } from "@/features/edit/EditView";
import { TransplantView } from "@/features/transplant/TransplantView";
import { CompareView } from "@/features/compare/CompareView";
import { CleanCopyView } from "@/features/cleancopy/CleanCopyView";
import { NdaTriageView } from "@/features/nda/NdaTriageView";
import { DefinedTermsView } from "@/features/terms/DefinedTermsView";
import { CrossRefView } from "@/features/xref/CrossRefView";
import "./toolshub.css";

type ToolKey =
  | "nda"
  | "compare"
  | "cleancopy"
  | "compliance"
  | "terms"
  | "xref"
  | "redact"
  | "fill"
  | "edit"
  | "transplant";

interface ToolDef {
  key: ToolKey;
  title: string;
  description: string;
  icon: ReactNode;
  view: ReactNode;
}

const TOOLS: ToolDef[] = [
  {
    key: "nda",
    title: "NDA triage",
    description: "Screen an inbound NDA against 10 standard criteria: Green, Yellow, or Red.",
    icon: <ChecklistIcon size={18} />,
    view: <NdaTriageView />,
  },
  {
    key: "compare",
    title: "Compare versions",
    description: "See what changed between this document and another version as tracked changes.",
    icon: <CompareIcon size={18} />,
    view: <CompareView />,
  },
  {
    key: "cleancopy",
    title: "Clean copy",
    description: "Accept changes and strip comments to produce a send-ready copy.",
    icon: <CleanIcon size={18} />,
    view: <CleanCopyView />,
  },
  {
    key: "compliance",
    title: "Compliance",
    description: "Check the document against a regulation or your own guideline questions.",
    icon: <ShieldCheckIcon size={18} />,
    view: <ComplianceView />,
  },
  {
    key: "terms",
    title: "Defined terms",
    description: "Find terms used but not defined, defined twice, or never used.",
    icon: <TermsIcon size={18} />,
    view: <DefinedTermsView />,
  },
  {
    key: "xref",
    title: "Cross-references",
    description: "Find references to a section or schedule that does not exist.",
    icon: <LinkIcon size={18} />,
    view: <CrossRefView />,
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
export function ToolsHub({
  intent,
  onIntentDone,
}: {
  /** A shell handoff can open a specific tool directly. */
  intent?: AppIntent | null;
  onIntentDone?: () => void;
} = {}) {
  const [selected, setSelected] = useState<ToolKey | null>(null);
  const active = TOOLS.find((t) => t.key === selected);

  useEffect(() => {
    if (intent?.kind === "openTool") {
      setSelected(intent.tool);
      onIntentDone?.();
    }
  }, [intent, onIntentDone]);

  if (active) {
    return (
      <div className="stack toolshub-tool">
        <Button
          variant="ghost"
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
