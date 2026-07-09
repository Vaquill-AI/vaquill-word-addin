import { useState } from "react";
import { Button, Banner } from "@/ui/primitives";
import { exportCorrectedDocx } from "@/api/contract-review";
import { downloadDocx } from "@/office/export";
import { readDocumentText } from "@/office/document";
import { applyVerifiedRedline, insertMissingClause, canApplyInPane } from "@/office/redline";
import { ApiError, friendlyMessage } from "@/api/errors";
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
  setDecision,
}: {
  redlines: RedlineSuggestion[];
  contractType: string;
  decisionOf: (i: number) => Decision;
  setDecision: (i: number, d: Decision) => void;
}) {
  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openApplicable = redlines
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => decisionOf(i) === "pending" && (r.grounding === "insertion" || canApplyInPane(r)));

  async function applyAll() {
    setError(null);
    setApplying({ done: 0, total: openApplicable.length });
    let done = 0;
    for (const { r, i } of openApplicable) {
      try {
        if (r.grounding === "insertion") await insertMissingClause(r);
        else await applyVerifiedRedline(r);
        setDecision(i, "accepted");
      } catch {
        // Leave this one open; the reviewer can handle it individually.
      }
      done += 1;
      setApplying({ done, total: openApplicable.length });
    }
    setApplying(null);
  }

  async function download() {
    setError(null);
    setDownloading(true);
    try {
      const documentText = await readDocumentText();
      const accepted: AcceptedRedline[] = redlines
        .filter((r) => r.grounding !== "insertion" && r.currentLanguage.trim())
        .map((r) => ({
          clauseName: r.clauseName,
          currentLanguage: r.currentLanguage,
          replacementLanguage: r.proposedLanguage,
          comment: r.rationale,
        }));
      const { base64, filename } = await exportCorrectedDocx({
        documentText,
        acceptedRedlines: accepted,
        contractType,
        trackedChanges: true,
      });
      downloadDocx(base64, filename);
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="action-bar">
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="action-bar__row">
        <Button
          variant="primary"
          block
          onClick={applyAll}
          loading={!!applying}
          disabled={openApplicable.length === 0}
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
