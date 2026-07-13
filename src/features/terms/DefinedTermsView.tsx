import { useCallback, useEffect, useState } from "react";
import { ViewHeader } from "@/ui/ViewHeader";
import { Badge, Banner, Button, Spinner } from "@/ui/primitives";
import { LocateIcon } from "@/ui/icons";
import { StatusGroup } from "@/ui/StatusGroup";
import type { StatusTone } from "@/ui/status";
import { readDocumentText } from "@/office/document";
import { selectClauseInDocument } from "@/office/navigate";
import { useDocumentAutoRefresh } from "@/lib/useDocumentAutoRefresh";
import {
  analyzeDefinedTerms,
  type DefinedTermsReport,
  type TermFinding,
  type TermFindingKind,
} from "@/lib/defined-terms";
import "./terms.css";

const KIND: Record<TermFindingKind, { tone: StatusTone; heading: string }> = {
  undefined: { tone: "red", heading: "Used but not defined" },
  duplicate: { tone: "yellow", heading: "Defined more than once" },
  unused: { tone: "neutral", heading: "Defined but never used" },
};

// Actionability order: a potential gap first, cleanup last.
const KIND_ORDER: TermFindingKind[] = ["undefined", "duplicate", "unused"];

function detail(f: TermFinding): string {
  if (f.kind === "duplicate") return `Defined ${f.definitionCount} times`;
  if (f.kind === "unused") return "Defined, never used";
  return `Used ${f.count}${f.count === 1 ? " time" : " times"}, never defined`;
}

type State =
  | { status: "scanning" }
  | { status: "ready"; report: DefinedTermsReport }
  | { status: "error"; error: string };

/**
 * Defined-terms hygiene checker (client-only). Reads the document, runs the pure
 * analyzer, and lists terms used-but-not-defined, defined-more-than-once, and
 * defined-but-never-used, each with a Find action that jumps to it in the doc.
 */
export function DefinedTermsView() {
  const [state, setState] = useState<State>({ status: "scanning" });
  const [note, setNote] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setNote(null);
    setState({ status: "scanning" });
    try {
      const text = await readDocumentText();
      setState({ status: "ready", report: analyzeDefinedTerms(text) });
    } catch (e) {
      setState({ status: "error", error: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  // Silent re-scan: refresh the report in place when the document is edited while
  // this view is open, without flashing the scanning spinner. Only replaces a
  // ready report so it never disrupts the loading or error states.
  const refresh = useCallback(async () => {
    try {
      const text = await readDocumentText();
      const report = analyzeDefinedTerms(text);
      setState((s) => (s.status === "ready" ? { status: "ready", report } : s));
    } catch {
      // Ignore transient read failures; the next change event or manual rescan recovers.
    }
  }, []);

  // Auto-refresh: re-scan when the document changes while this view is open.
  useDocumentAutoRefresh(refresh);

  async function find(term: string) {
    setNote(null);
    const ok = await selectClauseInDocument(term);
    if (!ok) setNote(`Could not locate "${term}" in the document.`);
  }

  const header = (
    <ViewHeader
        title="Defined terms"
        info="Checks defined-term hygiene: terms used but never defined, defined more than once, or defined but never used. A drafting aid over the standard definition styles ('X' means..., (the 'X')); it flags the common defects rather than every possible one."
        subtitle="Find defined-term gaps, duplicates, and dead definitions."
      />
  );

  if (state.status === "scanning") {
    return (
      <div className="stack terms-view">
        {header}
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Scanning defined terms...</span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="stack terms-view">
        {header}
        <Banner tone="danger">{state.error}</Banner>
        <Button variant="default" size="sm" onClick={() => void scan()} style={{ alignSelf: "flex-start" }}>
          Try again
        </Button>
      </div>
    );
  }

  const { report } = state;
  const byKind = KIND_ORDER.map((kind) => ({
    kind,
    items: report.findings.filter((f) => f.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="stack terms-view">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="view-title">Defined terms</h1>
        <Button variant="ghost" size="sm" onClick={() => void scan()}>
          Rescan
        </Button>
      </div>

      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge tone="brand">{report.definedCount} defined</Badge>
        <Badge tone={report.findings.length > 0 ? "yellow" : "green"}>
          {report.findings.length} issue{report.findings.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {note && <Banner tone="warn">{note}</Banner>}

      {report.findings.length === 0 ? (
        <Banner tone="success">
          No defined-term issues found.
          {report.definedCount > 0
            ? ` All ${report.definedCount} defined terms look consistent.`
            : " No defined terms were detected in this document."}
        </Banner>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {byKind.map(({ kind, items }) => (
            <StatusGroup
              key={kind}
              tone={KIND[kind].tone}
              label={KIND[kind].heading}
              count={items.length}
              defaultOpen={kind !== "unused"}
            >
              {items.map((f) => (
                <div key={`${kind}-${f.term}`} className="terms-row">
                  <div className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <span className="terms-term">{f.term}</span>
                    <span className="small muted">{detail(f)}</span>
                    {f.context && (
                      <span className="ctx-line">
                        {f.context.before}
                        <mark className="ctx-hit">{f.term}</mark>
                        {f.context.after}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void find(f.term)}
                    aria-label={`Find ${f.term} in the document`}
                    title="Find in document"
                  >
                    <LocateIcon size={13} /> Find
                  </Button>
                </div>
              ))}
            </StatusGroup>
          ))}
        </div>
      )}
    </div>
  );
}
