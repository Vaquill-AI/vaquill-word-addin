import { useCallback, useEffect, useState } from "react";
import { ViewHeader } from "@/ui/ViewHeader";
import { Banner, Button, IconButton, Spinner } from "@/ui/primitives";
import { CheckIcon, LocateIcon } from "@/ui/icons";
import { readDocumentText } from "@/office/document";
import { locateInDocument } from "@/office/navigate";
import { insertCommentAnchored } from "@/office/comments";
import { useAppNav } from "@/app/nav";
import { useDocumentAutoRefresh } from "@/lib/useDocumentAutoRefresh";
import { analyzeFigures, type FiguresReport } from "@/lib/figures";
import { errorMessage } from "@/api/errors";
import "./figures.css";

/**
 * Figures check: find places where a number in words disagrees with the numeral
 * next to it ("thirty (40) days"). Read-only, client-side; jump to any mismatch.
 */
export function FiguresView() {
  const { navigate } = useAppNav();
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

  // Cross-link: send a figures mismatch to the Assistant to resolve.
  function askAboutFigure(
    words: string,
    wordsValue: string | number,
    numeralValue: string | number,
  ) {
    navigate("assistant", {
      kind: "assistantAsk",
      prompt: `In the open contract, a figure is written inconsistently: the words "${words}" say ${wordsValue}, but the numeral beside it says ${numeralValue}. Which is likely correct, and how should I fix it?`,
      scope: "document",
      autoSend: true,
      documentOnly: true,
    });
  }

  // Cross-link: drop a native Word comment on the mismatched figure.
  async function commentOnFigure(
    anchor: string,
    wordsValue: string | number,
    numeralValue: string | number,
  ) {
    setError(null);
    const r = await insertCommentAnchored(
      anchor,
      `Figures mismatch: the words say ${wordsValue} but the numeral says ${numeralValue}. Confirm which is correct.`,
    );
    if (r === "not_found") setError("Could not locate this figure to comment on.");
    else if (r === "unsupported_region") setError("Word does not allow a comment in that location.");
  }

  return (
    <div className="stack figures" data-tour="fig-header">
      <ViewHeader
        tourId="tool-figures"
        title="Figures check"
        subtitle="Find numbers written in words that do not match the numeral beside them."
        info="Only pairs it can read confidently are checked, so unusual phrasings are skipped rather than mis-flagged."
        onRescan={() => void load()}
        rescanning={report === null}
      />

      {/* Plain-language explainer with examples, so what counts as a mismatch is
          obvious without hovering the header info. */}
      <div className="figures-explainer">
        <p className="small muted figures-explainer__lead">
          A number spelled out in words should match the numeral beside it. When
          they disagree it is a costly ambiguity (courts have split on which one
          controls), so this flags every spelled-out number whose numeral does not
          agree.
        </p>
        <div className="figures-egs">
          <span className="figures-eg figures-eg--bad">
            <span className="figures-eg__tag">Flagged</span>
            thirty <b>(40)</b> days
          </span>
          <span className="figures-eg figures-eg--bad">
            <span className="figures-eg__tag">Flagged</span>
            ten thousand dollars <b>($15,000)</b>
          </span>
          <span className="figures-eg figures-eg--bad">
            <span className="figures-eg__tag">Flagged</span>
            twelve percent <b>(10%)</b>
          </span>
          <span className="figures-eg figures-eg--ok">
            <span className="figures-eg__tag">Fine</span>
            three (3) years
          </span>
        </div>
      </div>

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
                <span className="row" style={{ gap: 4, flexShrink: 0 }}>
                  <IconButton label="Find in document" onClick={() => void find(mm.anchor)}>
                    <LocateIcon size={13} />
                  </IconButton>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => askAboutFigure(mm.words, mm.wordsValue, mm.numeralValue)}
                    title="Ask the assistant about this"
                    aria-label="Ask the assistant about this figure"
                  >
                    Ask
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void commentOnFigure(mm.anchor, mm.wordsValue, mm.numeralValue)}
                    title="Add a comment in the document"
                    aria-label="Comment on this figure in the document"
                  >
                    Comment
                  </Button>
                </span>
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
