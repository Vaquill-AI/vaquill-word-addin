import { useCallback, useEffect, useState } from "react";
import { ViewHeader } from "@/ui/ViewHeader";
import { Banner, IconButton, Spinner } from "@/ui/primitives";
import { CheckIcon, LocateIcon } from "@/ui/icons";
import { readDocumentText } from "@/office/document";
import { locateInDocument } from "@/office/navigate";
import { useDocumentAutoRefresh } from "@/lib/useDocumentAutoRefresh";
import { analyzeFigures, type FiguresReport } from "@/lib/figures";
import { errorMessage } from "@/api/errors";
import "./figures.css";

/**
 * Figures check: find places where a number in words disagrees with the numeral
 * next to it ("thirty (40) days"). Read-only, client-side; jump to any mismatch.
 */
export function FiguresView() {
  const [report, setReport] = useState<FiguresReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReport(analyzeFigures(await readDocumentText()));
    } catch (e) {
      setError(errorMessage(e));
      setReport({ checked: 0, mismatches: [] });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useDocumentAutoRefresh(load);

  async function find(anchor: string) {
    setError(null);
    try {
      await locateInDocument(anchor);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="stack figures" data-tour="fig-header">
      <ViewHeader
        tourId="tool-figures"
        title="Figures check"
        subtitle="Find numbers written in words that do not match the numeral beside them."
        info="Checks every 'words (numeral)' pair, e.g. 'thirty (30) days' or 'ten thousand dollars ($10,000)', and flags the ones that disagree. It only checks pairs it can read confidently, so unusual phrasings are skipped rather than mis-flagged."
      />

      {error && <Banner tone="danger">{error}</Banner>}

      {report === null ? (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Checking figures...</span>
        </div>
      ) : report.mismatches.length === 0 ? (
        <Banner tone={report.checked > 0 ? "success" : "info"}>
          {report.checked > 0 ? (
            <>
              <CheckIcon size={13} /> All {report.checked} number/word pair
              {report.checked === 1 ? "" : "s"} agree.
            </>
          ) : (
            "No 'words (numeral)' pairs found to check in this document."
          )}
        </Banner>
      ) : (
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>
            {report.mismatches.length} mismatch{report.mismatches.length === 1 ? "" : "es"} of{" "}
            {report.checked} pair{report.checked === 1 ? "" : "s"} checked.
          </p>
          {report.mismatches.map((mm, i) => (
            <div key={`${i}-${mm.anchor}`} className="card figures-row" data-tour="fig-mismatch">
              <div className="figures-row__head" data-tour="fig-find">
                <span className="small figures-phrase">
                  <span className="figures-words">{mm.words}</span> ({mm.wordsValue}) vs numeral (
                  {mm.numeral})
                </span>
                <IconButton label="Find in document" onClick={() => void find(mm.anchor)}>
                  <LocateIcon size={13} />
                </IconButton>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                Words say {mm.wordsValue}, numeral says {mm.numeralValue}. Confirm which is correct.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
