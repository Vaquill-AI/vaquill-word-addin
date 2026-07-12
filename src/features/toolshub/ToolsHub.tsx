import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/ui/primitives";
import type { AppIntent } from "@/app/nav";
import {
  ArrowLeftIcon,
  RedactIcon,
  CleanIcon,
  TermsIcon,
  LinkIcon,
  SendIcon,
} from "@/ui/icons";
import { ToolCard, ToolCardList } from "@/ui/ToolCard";
import { RedactView } from "@/features/redact/RedactView";
import { CleanCopyView } from "@/features/cleancopy/CleanCopyView";
import { DefinedTermsView } from "@/features/terms/DefinedTermsView";
import { CrossRefView } from "@/features/xref/CrossRefView";
import { SendReadyView } from "@/features/sendready/SendReadyView";
import "./toolshub.css";

// ToolKey is shared with the nav intent bus (@/app/nav). Kept in sync there.
type ToolKey =
  | "cleancopy"
  | "terms"
  | "xref"
  | "sendready"
  | "redact";

// Tools are grouped by where they sit in the lawyer's flow, so the launcher
// reads as a workflow (understand the doc -> change it -> prepare to send) rather
// than a flat wall of cards.
type ToolGroup = "check" | "send";

const GROUP_ORDER: { key: ToolGroup; label: string }[] = [
  { key: "check", label: "Check" },
  { key: "send", label: "Send" },
];

interface ToolDef {
  key: ToolKey;
  group: ToolGroup;
  title: string;
  description: string;
  icon: ReactNode;
  view: ReactNode;
}

const TOOLS: ToolDef[] = [
  // Check: verify the open document's internal integrity.
  {
    key: "terms",
    group: "check",
    title: "Defined terms",
    description: "Find terms used but not defined, defined twice, or never used.",
    icon: <TermsIcon size={18} />,
    view: <DefinedTermsView />,
  },
  {
    key: "xref",
    group: "check",
    title: "Cross-references",
    description: "Find references to a section or schedule that does not exist.",
    icon: <LinkIcon size={18} />,
    view: <CrossRefView />,
  },
  // Send: prepare the document to leave the building.
  {
    key: "sendready",
    group: "send",
    title: "Send-ready check",
    description: "Pre-flight: everything that still needs fixing before this document is sent.",
    icon: <SendIcon size={18} />,
    view: <SendReadyView />,
  },
  {
    key: "cleancopy",
    group: "send",
    title: "Clean copy",
    description: "Accept changes and strip comments to produce a send-ready copy.",
    icon: <CleanIcon size={18} />,
    view: <CleanCopyView />,
  },
  {
    key: "redact",
    group: "send",
    title: "Redact",
    description: "Find and permanently remove sensitive information from the document.",
    icon: <RedactIcon size={18} />,
    view: <RedactView />,
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
          Work on the open document: review it, revise it, prepare it to send.
        </p>
      </div>
      {GROUP_ORDER.map((g) => {
        const tools = TOOLS.filter((t) => t.group === g.key);
        if (tools.length === 0) return null;
        return (
          <div key={g.key} className="stack toolshub-group">
            <h2 className="toolshub-group__label">{g.label}</h2>
            <ToolCardList>
              {tools.map((t) => (
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
      })}
    </div>
  );
}
