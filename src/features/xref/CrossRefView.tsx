import { useCallback, useEffect, useState } from "react";
import { ViewHeader } from "@/ui/ViewHeader";
import { Badge, Banner, Button, Spinner } from "@/ui/primitives";
import { LocateIcon } from "@/ui/icons";
import { readNumberedParagraphs } from "@/office/structure";
import { selectClauseInDocument } from "@/office/navigate";
import { analyzeCrossReferences, type CrossRefReport } from "@/lib/cross-references";
import { useDocumentAutoRefresh } from "@/lib/useDocumentAutoRefresh";
import "./xref.css";

type State =
  | { status: "scanning" }
  | { status: "ready"; report: CrossRefReport }
  | { status: "error"; error: string };

/**
 * Cross-reference integrity checker (client-only). Reads the document's
 * paragraphs (with auto-numbering), runs the pure analyzer, and lists internal
 * references that point at a section/schedule that does not exist, each with a
 * Find action that jumps to the reference in the document.
 */
export function CrossRefView() {
  const [state, setState] = useState<State>({ status: "scanning" });
  const [note, setNote] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setNote(null);
    setState({ status: "scanning" });
    try {
      const paragraphs = await readNumberedParagraphs();
      setState({ status: "ready", report: analyzeCrossReferences(paragraphs) });
    } catch (e) {
      setState({ status: "error", error: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  // Silent re-scan: refresh the report in place when the document is edited (a
  // clause renumber can break refs), without flashing the scanning spinner.
  const refresh = useCallback(async () => {
    try {
      const paragraphs = await readNumberedParagraphs();
      const report = analyzeCrossReferences(paragraphs);
      setState((s) => (s.status === "ready" ? { status: "ready", report } : s));
    } catch {
      // Ignore transient read failures; the next change event or rescan recovers.
    }
  }, []);

  // Auto-refresh: re-scan when the document changes while this view is open.
  useDocumentAutoRefresh(refresh);

  async function find(label: string) {
    setNote(null);
    const ok = await selectClauseInDocument(label);
    if (!ok) setNote(`Could not locate "${label}" in the document.`);
  }

  const header = (
    <ViewHeader
        title="Cross-references"
        info="Checks internal references (see Section 7.4, Exhibit C) against the sections and schedules that actually exist, catching pointers left dangling after clauses were cut or renumbered. Reads both typed and auto-numbered sections. Roman-numeral Articles are out of scope."
        subtitle="Find references that point at a section or schedule that does not exist."
      />
  );

  if (state.status === "scanning") {
    return (
      <div className="stack xref-view">
        {header}
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Checking cross-references...</span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="stack xref-view">
        {header}
        <Banner tone="danger">{state.error}</Banner>
        <Button variant="default" size="sm" onClick={() => void scan()} style={{ alignSelf: "flex-start" }}>
          Try again
        </Button>
      </div>
    );
  }

  const { report } = state;

  return (
    <div className="stack xref-view">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="view-title">Cross-references</h1>
        <Button variant="ghost" size="sm" onClick={() => void scan()}>
          Rescan
        </Button>
      </div>

      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge tone="brand">{report.sectionCount} sections</Badge>
        {report.scheduleCount > 0 && (
          <Badge tone="brand">{report.scheduleCount} schedules</Badge>
        )}
        <Badge tone={report.broken.length > 0 ? "red" : "green"}>
          {report.broken.length} broken
        </Badge>
      </div>

      {note && <Banner tone="warn">{note}</Banner>}

      {!report.checkedSections ? (
        <Banner tone="info">
          Could not confidently map this document's section numbering (found{" "}
          {report.sectionCount}), so section references were not checked. This happens with
          unusual or inconsistent numbering.
        </Banner>
      ) : report.broken.length === 0 ? (
        <Banner tone="success">
          No broken cross-references found. Every reference resolves to an existing section
          {report.scheduleCount > 0 ? " or schedule" : ""}.
        </Banner>
      ) : (
        <div className="stack" style={{ gap: 0 }}>
          {report.broken.map((b) => (
            <div key={`${b.kind}-${b.label}`} className="xref-row">
              <div className="stack" style={{ gap: 0, minWidth: 0 }}>
                <span className="xref-label">{b.label}</span>
                <span className="small muted">
                  Referenced {b.count}
                  {b.count === 1 ? " time" : " times"}, not found
                </span>
                {b.context && (
                  <span className="ctx-line">
                    {b.context.before}
                    <mark className="ctx-hit">{b.label}</mark>
                    {b.context.after}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void find(b.label)}
                aria-label={`Find ${b.label} in the document`}
                title="Find in document"
              >
                <LocateIcon size={13} /> Find
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
