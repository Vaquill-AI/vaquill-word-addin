import { useState } from "react";
import { Button, Banner, LiveRegion } from "@/ui/primitives";
import { exportCorrectedDocx } from "@/api/contract-review";
import { downloadDocx } from "@/office/export";
import { readDocumentText } from "@/office/document";
import { applyVerifiedRedline, canApplyInPane } from "@/office/redline";
import { insertClauseFormatted } from "@/office/richInsert";
import { errorMessage } from "@/api/errors";
import type { RedlineSuggestion, AcceptedRedline } from "@/api/types";
import type { Decision } from "./decisions";

/**
 * Sticky bottom bar. Two clearly separated actions:
 *  - Apply all open verified redlines in place, as tracked changes.
 *  - Download a clean redlined copy generated server-side (authored
 *    "Vaquill AI Contract Review"), for sharing without touching the working doc.
 */
export function ReviewActionBar({
  redlines,
  contractType,
  decisionOf,
  decisionOfLive,
  setDecision,
  applyBusy,
  setApplyBusy,
}: {
  redlines: RedlineSuggestion[];
  contractType: string;
  decisionOf: (i: number) => Decision;
  /** Always-current decision reader (see useDecisions) - use inside the async
   *  loop so a dismissal that lands mid-run is honored. */
  decisionOfLive: (i: number) => Decision;
  setDecision: (i: number, d: Decision) => void;
  /** Shared apply lock (see ReviewView) so this and a per-card Accept cannot run
   *  concurrently. */
  applyBusy: boolean;
  setApplyBusy: (b: boolean) => void;
}) {
  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const openApplicable = redlines
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => decisionOf(i) === "pending" && (r.grounding === "insertion" || canApplyInPane(r)));

  async function applyAll() {
    // Never run concurrently with a per-card Accept (a double insertion-redline
    // would append the clause to the document twice).
    if (applyBusy) return;
    setError(null);
    setNote(null);
    const total = openApplicable.length;
    setApplyBusy(true);
    setApplying({ done: 0, total });
    let done = 0;
    let failed = 0;
    let skipped = 0;
    try {
      for (const { r, i } of openApplicable) {
        // Re-read the LIVE decision: the snapshot was captured at click time, so a
        // redline the reviewer dismissed (or accepted) during this loop must not
        // be written with the stale proposal.
        if (decisionOfLive(i) !== "pending") {
          skipped += 1;
          done += 1;
          setApplying({ done, total });
          continue;
        }
        try {
          if (r.grounding === "insertion") await insertClauseFormatted(r.clauseName, r.proposedLanguage);
          else await applyVerifiedRedline(r);
          setDecision(i, "accepted");
        } catch {
          // Leave this one open; the reviewer handles it individually. This is the
          // ambiguous-anchor / not-found path, so it must be surfaced, not silent.
          failed += 1;
        }
        done += 1;
        setApplying({ done, total });
      }
    } finally {
      setApplying(null);
      setApplyBusy(false);
    }
    const applied = total - failed - skipped;
    if (failed > 0) {
      setError(
        `Applied ${applied} of ${total}. ${failed} could not be placed automatically (the clause text was not found or appears more than once); apply those individually.`,
      );
    } else {
      setNote(
        `Applied ${applied} redline${applied === 1 ? "" : "s"} as tracked changes.` +
          (skipped > 0 ? ` ${skipped} skipped (resolved while applying).` : ""),
      );
    }
  }

  async function download() {
    setError(null);
    // Honor the reviewer's decisions: exclude REJECTED redlines (previously
    // every non-insertion redline baked in regardless, silently disagreeing
    // with the "Apply all open" button). Inserted (missing-clause) redlines
    // have no currentLanguage to replace, so they can't go in a corrected
    // export -- excluding them also avoids sending an empty list, which the
    // backend rejects with a 422 (min_length=1).
    const accepted: AcceptedRedline[] = redlines
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r, i }) =>
          r.grounding !== "insertion" && r.currentLanguage.trim() && decisionOf(i) !== "rejected",
      )
      .map(({ r }) => ({
        clauseName: r.clauseName,
        currentLanguage: r.currentLanguage,
        replacementLanguage: r.proposedLanguage,
        comment: r.rationale,
      }));
    if (accepted.length === 0) {
      setError(
        "No replaceable redlines to export. Inserted (missing-clause) suggestions apply in the pane only, and rejected redlines are excluded.",
      );
      return;
    }
    setDownloading(true);
    try {
      const documentText = await readDocumentText();
      const { base64, filename } = await exportCorrectedDocx({
        documentText,
        acceptedRedlines: accepted,
        contractType,
        trackedChanges: true,
      });
      downloadDocx(base64, filename);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="action-bar">
      {error && <Banner tone="danger">{error}</Banner>}
      {note && (
        <LiveRegion>
          <Banner tone="info">{note}</Banner>
        </LiveRegion>
      )}
      <div className="action-bar__row">
        <Button
          variant="primary"
          block
          onClick={applyAll}
          loading={!!applying}
          disabled={openApplicable.length === 0 || (applyBusy && !applying)}
        >
          {applying
            ? `Applying ${applying.done}/${applying.total}...`
            : openApplicable.length > 0
              ? `Apply all open (${openApplicable.length})`
              : "All addressed"}
        </Button>
        <Button
          variant="default"
          block
          onClick={download}
          loading={downloading}
          title="Download a redlined .docx"
        >
          {downloading ? "Preparing..." : "Download .docx"}
        </Button>
      </div>
    </div>
  );
}
