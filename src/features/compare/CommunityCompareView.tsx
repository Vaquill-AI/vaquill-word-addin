import { useState, type ReactNode } from "react";
import { ViewHeader } from "@/ui/ViewHeader";
import { Badge, Banner, Button } from "@/ui/primitives";
import { Dropzone } from "@/ui/Dropzone";
import { CheckIcon, CompareIcon, PlusIcon } from "@/ui/icons";
import { errorMessage } from "@/api/errors";
import { readDocumentText } from "@/office/document";
import { extractTextFromFile } from "@/community/extractText";
import { applyCompareDiff, computeCompareOps, type CompareOp } from "@/office/compareDiff";
import { useAppNav } from "@/app/nav";
import "./compare.css";

// On-device compare reads the reference to plain text in the browser (mammoth
// for .docx, native for .txt/.md). PDF/.doc need server conversion we do not
// have here, so they are not offered.
const ACCEPT = ".docx,.txt,.md";

// A single unchanged run longer than this is collapsed to head + tail so the
// preview stays focused on what actually differs.
const CONTEXT_COLLAPSE_AT = 120;
const CONTEXT_KEEP = 48;

interface CompareResult {
  ops: CompareOp[];
  /** Number of insertion segments (text only in the reference). */
  added: number;
  /** Number of deletion segments (text only in the open document). */
  removed: number;
  referenceText: string;
  refName: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "comparing" }
  | { kind: "ready"; result: CompareResult }
  | { kind: "error"; message: string };

/**
 * Community / BYOK Document Compare. Diffs the open document against a reference
 * version entirely on-device (no backend): reads both to text, shows what
 * differs, and can write the differences into the open document as native
 * tracked changes. See `office/compareDiff.ts` for the direction and limits.
 */
export function CommunityCompareView() {
  const { navigate } = useAppNav();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyNote, setApplyNote] = useState<string | null>(null);

  async function runCompare(file: File) {
    setPhase({ kind: "comparing" });
    setApplied(false);
    setApplyNote(null);
    try {
      const [openText, extracted] = await Promise.all([
        readDocumentText(),
        extractTextFromFile(file),
      ]);
      if (!openText.trim()) {
        setPhase({
          kind: "error",
          message:
            "The open document has no readable text. If it is a scanned image, it needs to be converted to text first.",
        });
        return;
      }
      if (!extracted.text.trim()) {
        setPhase({
          kind: "error",
          message:
            "Could not read any text from the reference. On-device compare supports .docx, .txt, and .md files.",
        });
        return;
      }
      const ops = computeCompareOps(openText, extracted.text);
      const added = ops.filter((o) => o[0] === 1).length;
      const removed = ops.filter((o) => o[0] === -1).length;
      setPhase({
        kind: "ready",
        result: { ops, added, removed, referenceText: extracted.text, refName: extracted.filename },
      });
    } catch (e) {
      setPhase({ kind: "error", message: errorMessage(e) });
    }
  }

  async function apply(result: CompareResult) {
    setApplying(true);
    setApplyNote(null);
    try {
      await applyCompareDiff(result.referenceText);
      setApplied(true);
    } catch (e) {
      setApplyNote(errorMessage(e));
    } finally {
      setApplying(false);
    }
  }

  function reset() {
    setPhase({ kind: "idle" });
    setApplied(false);
    setApplyNote(null);
  }

  if (phase.kind === "ready") {
    const { result } = phase;
    const changes = result.added + result.removed;
    return (
      <div className="stack compare-view">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="view-title">Compare</h1>
          <Button variant="ghost" size="sm" onClick={reset}>
            <PlusIcon size={13} /> New comparison
          </Button>
        </div>

        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <Badge tone={changes > 0 ? "brand" : "green"}>
            {changes > 0 ? <CompareIcon size={11} /> : <CheckIcon size={11} />}
            {changes} change{changes === 1 ? "" : "s"}
          </Badge>
          <span className="small muted">vs {result.refName}</span>
        </div>

        {changes === 0 ? (
          <Banner tone="info">No text differences were found between the two versions.</Banner>
        ) : (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <h3 className="small muted" style={{ margin: 0 }}>
                  Differences
                </h3>
                <div className="compare-legend">
                  <span className="compare-legend__key">
                    <del className="compare-diff__del">removed</del> your document
                  </span>
                  <span className="compare-legend__key">
                    <ins className="compare-diff__ins">added</ins>{" "}
                    {result.refName || "the reference"}
                  </span>
                </div>
              </div>

              <div className="compare-diff" role="region" aria-label="Differences">
                {renderCompareOps(result.ops)}
              </div>
            </div>

            <div className="compare-actions stack" style={{ gap: 8 }}>
              {applied ? (
                <div className="stack" style={{ gap: 6 }}>
                  <Banner tone="info">
                    <CheckIcon size={13} /> The differences were written into your document as tracked
                    changes. Accept them to match the reference, or use Word's Undo (Ctrl+Z) to revert.
                  </Banner>
                  <Button
                    variant="default"
                    size="sm"
                    style={{ alignSelf: "flex-start" }}
                    onClick={() => navigate("review", { kind: "openReviewSub", sub: "changes" })}
                  >
                    Triage these changes
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    variant="primary"
                    className="btn--cta"
                    onClick={() => void apply(result)}
                    loading={applying}
                    disabled={applying}
                  >
                    <CompareIcon size={14} /> Apply as tracked changes
                  </Button>
                  <span className="small muted">
                    Writes every difference into the open document as native tracked changes.
                    Non-destructive: accept to match the reference, reject to keep your version.
                  </span>
                </>
              )}
              {applyNote && <Banner tone="danger">{applyNote}</Banner>}
            </div>
          </>
        )}
      </div>
    );
  }

  // idle / comparing / error
  return (
    <div className="stack compare-view">
      <ViewHeader
        title="Compare"
        info="Compare the open document against another version, entirely on this device. The differences are shown as a redline and can be written into your document as native tracked changes. Text-level compare: it needs a .docx, .txt, or .md reference and does not mark formatting-only changes."
        subtitle="See what changed between this document and another version."
      />

      <Dropzone
        accept={ACCEPT}
        label="Reference version to compare against"
        hint="Word (.docx), text, or markdown."
        onFile={(f) => void runCompare(f)}
        busy={phase.kind === "comparing"}
        busyLabel="Comparing on this device..."
      />

      <p className="small muted" style={{ margin: 0 }}>
        Compares on this device. Nothing is uploaded. For PDF references, formatting-aware diffs, and
        an AI change summary, use the Vaquill AI hosted plan.
      </p>

      {phase.kind === "error" && <Banner tone="danger">{phase.message}</Banner>}
    </div>
  );
}

/**
 * Render the diff ops as inline marks, collapsing long unchanged runs to
 * head + tail so the preview stays about what changed. Deletions are open-only
 * text; insertions are reference-only text (same direction as the apply).
 */
function renderCompareOps(ops: CompareOp[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  ops.forEach(([op, text], i) => {
    if (op === -1) {
      nodes.push(
        <del key={i} className="compare-diff__del">
          {text}
        </del>,
      );
      return;
    }
    if (op === 1) {
      nodes.push(
        <ins key={i} className="compare-diff__ins">
          {text}
        </ins>,
      );
      return;
    }
    // Unchanged: keep short runs whole; collapse long ones to head ... tail.
    if (text.length <= CONTEXT_COLLAPSE_AT) {
      nodes.push(<span key={i}>{text}</span>);
      return;
    }
    const isFirst = i === 0;
    const isLast = i === ops.length - 1;
    const head = isFirst ? "" : text.slice(0, CONTEXT_KEEP);
    const tail = isLast ? "" : text.slice(-CONTEXT_KEEP);
    nodes.push(
      <span key={i}>
        {head}
        <span className="compare-diff__gap"> [...] </span>
        {tail}
      </span>,
    );
  });
  return nodes;
}
