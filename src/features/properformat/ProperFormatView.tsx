import { useEffect, useState } from "react";
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  LiveRegion,
  SegmentedControl,
  Spinner,
  Toggle,
} from "@/ui/primitives";
import { ViewHeader } from "@/ui/ViewHeader";
import { CheckIcon } from "@/ui/icons";
import { useAppNav } from "@/app/nav";
import type { FixKey, FormatReport, FormatScope } from "@/office/format";
import { FIX_KEYS, useProperFormat } from "./useProperFormat";
import "./properformat.css";

const FIX_META: Record<FixKey, { title: string; hint: (r: FormatReport) => string; word: string }> = {
  font: {
    title: "Unify body font",
    word: "font",
    hint: (r) =>
      `${r.fontsFound} font${r.fontsFound === 1 ? "" : "s"} found${r.targetFont ? ` to ${r.targetFont}` : ""}`,
  },
  size: {
    title: "Unify body size",
    word: "size",
    hint: (r) => (r.targetSize != null ? `Standardize to ${r.targetSize} pt` : "Standardize size"),
  },
  spacing: {
    title: "Normalize paragraph spacing",
    word: "spacing",
    hint: () => "Match the document's dominant spacing",
  },
};

const SKIP_LABEL: Record<keyof FormatReport["skips"], string> = {
  tables: "in tables",
  lists: "list items",
  headings: "headings",
  aligned: "centered / right",
  controls: "in content controls",
  nonLatin: "non-Latin script",
  protectedZone: "signatures / exhibits",
};

/** Join words as "a", "a and b", "a, b and c". */
function humanJoin(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * Proper Format tool. One click scans the document for formatting inconsistency,
 * shows what it found, and (on confirm) unifies the base font, size, and spacing
 * of plain body paragraphs toward the document's own dominant style. It never
 * touches tables, lists, headings, numbering, indentation, or signatures, and it
 * refuses to run over tracked changes. Word Undo reverses the pass.
 */
export function ProperFormatView() {
  const { state, scan, setFixes, apply } = useProperFormat();
  const { navigate } = useAppNav();
  const [scope, setScope] = useState<FormatScope>("document");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void scan("document");
  }, [scan]);

  function changeScope(next: FormatScope) {
    setScope(next);
    void scan(next);
  }

  const header = (
    <ViewHeader
      tourId="tool-properFormat"
      title="Proper Format"
      subtitle="Make ordinary body paragraphs consistent. Numbering, tables, and signatures are never changed."
      info="Unifies the base font, size, and spacing of plain body paragraphs toward the document's own dominant style. It skips tables, lists, headings, signatures, and exhibits, and never changes indentation, numbering, or cross-references. Word Undo (Ctrl+Z) reverses it."
    />
  );

  if (state.status === "idle" || state.status === "scanning") {
    return (
      <div className="stack properformat">
        {header}
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Analyzing formatting...</span>
        </div>
      </div>
    );
  }

  if (state.status === "applying") {
    return (
      <div className="stack properformat">
        {header}
        <LiveRegion>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <Spinner />{" "}
            <span className="small muted">
              Standardizing{state.total > 0 ? ` ${state.done} of ${state.total}` : ""}...
            </span>
          </div>
        </LiveRegion>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="stack properformat">
        {header}
        <Banner tone="danger">{state.error}</Banner>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void scan(scope)}
          style={{ alignSelf: "flex-start" }}
        >
          Rescan
        </Button>
      </div>
    );
  }

  if (state.status === "done") {
    return (
      <div className="stack properformat">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="view-title">Proper Format</h1>
          <Button variant="ghost" size="sm" onClick={() => void scan(state.scope)}>
            Rescan
          </Button>
        </div>
        <LiveRegion>
          <Banner tone="success">
            <CheckIcon size={13} /> Standardized {state.changed} paragraph
            {state.changed === 1 ? "" : "s"}. Word Undo (Ctrl+Z) reverses this.
          </Banner>
        </LiveRegion>
      </div>
    );
  }

  // review
  const { report, fixes } = state;
  const totalOffenders = FIX_KEYS.reduce((n, k) => n + report.counts[k], 0);
  const enabledOffenders = FIX_KEYS.filter((k) => fixes.has(k)).reduce(
    (n, k) => n + report.counts[k],
    0,
  );
  const skipEntries = (Object.keys(report.skips) as (keyof FormatReport["skips"])[]).filter(
    (k) => report.skips[k] > 0,
  );
  const enabledWords = FIX_KEYS.filter((k) => fixes.has(k)).map((k) => FIX_META[k].word);

  const protectedNote = skipEntries.length > 0 && (
    <div className="stack pf-protected" style={{ gap: 4 }}>
      <span className="small muted">Protected and unchanged:</span>
      <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
        {skipEntries.map((k) => (
          <Badge key={k} tone="neutral">
            {report.skips[k]} {SKIP_LABEL[k]}
          </Badge>
        ))}
      </div>
    </div>
  );

  const scopeControl = (
    <div data-tour="pf-scope">
      <SegmentedControl
        label="Scope"
        value={scope}
        onChange={changeScope}
        options={[
          { value: "document", label: "Whole document" },
          { value: "selection", label: "Selection" },
        ]}
      />
    </div>
  );

  return (
    <div className="stack properformat">
      {header}
      {scopeControl}

      {report.blocked === "tracked-changes" ? (
        <div className="stack" style={{ gap: 8 }}>
          <Banner tone="warn">
            This document has tracked changes. Accept or reject them first so formatting does not
            disturb the redline.
          </Banner>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("tools", { kind: "openTool", tool: "cleancopy" })}
            style={{ alignSelf: "flex-start" }}
          >
            Open Clean copy
          </Button>
        </div>
      ) : report.blocked === "empty" ? (
        <Banner tone="info">
          No body text to format{scope === "selection" ? " in the selection" : ""} yet.
        </Banner>
      ) : totalOffenders === 0 ? (
        <div className="stack" style={{ gap: 10 }}>
          <Banner tone="success">
            <CheckIcon size={13} /> Already consistent. The body font, size, and spacing all match.
          </Banner>
          {protectedNote}
        </div>
      ) : (
        <>
          <p className="small muted pf-summary">
            {report.eligible} of {report.bodyParagraphs} paragraph
            {report.bodyParagraphs === 1 ? "" : "s"} are plain body text
            {report.targetFont
              ? `, mostly ${report.targetFont}${report.targetSize != null ? ` ${report.targetSize} pt` : ""}`
              : ""}
            .
          </p>

          <div className="stack pf-fixes" data-tour="pf-fixes">
            {FIX_KEYS.filter((k) => report.counts[k] > 0).map((k) => (
              <div className="row pf-fix" key={k}>
                <Toggle
                  checked={fixes.has(k)}
                  onChange={(on) => {
                    const next = new Set(fixes);
                    if (on) next.add(k);
                    else next.delete(k);
                    setFixes(next);
                  }}
                  label={FIX_META[k].title}
                />
                <div className="stack pf-fix__text" style={{ gap: 0 }}>
                  <span className="small" style={{ fontWeight: 600 }}>
                    {FIX_META[k].title}
                  </span>
                  <span className="small muted">{FIX_META[k].hint(report)}</span>
                </div>
                <span className="pf-count small muted">{report.counts[k]}</span>
              </div>
            ))}
          </div>

          {protectedNote}

          <Button
            variant="primary"
            className="btn--cta"
            data-tour="pf-apply"
            disabled={enabledOffenders === 0}
            onClick={() => setConfirming(true)}
          >
            Standardize formatting
          </Button>
          <p className="small muted pf-foot">
            Applied clean, not as tracked changes. Word Undo (Ctrl+Z) reverses it.
          </p>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        title="Standardize formatting?"
        body={
          <>
            Unify the {humanJoin(enabledWords) || "formatting"} of plain body paragraphs toward the
            document's dominant style. Tables, lists, headings, numbering, indentation, and
            signatures are left unchanged. Word Undo (Ctrl+Z) reverses it.
          </>
        }
        confirmLabel="Standardize"
        onConfirm={() => {
          setConfirming(false);
          void apply(fixes, scope);
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
