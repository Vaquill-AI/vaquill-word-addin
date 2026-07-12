import { useState } from "react";
import { Button, Banner } from "@/ui/primitives";
import {
  highlightIssues,
  clearIssueHighlights,
  highlightCoverage,
  clearCoverageHighlights,
} from "@/office/highlight";
import { insertRationaleComments } from "@/office/comments";
import { bookmarkClauses } from "@/office/bookmarks";
import { tagKeyFields } from "@/office/contentControls";
import type { RedlineSuggestion } from "@/api/types";

/** Stable, Word-valid bookmark name for a redline (no spaces). */
function bookmarkName(index: number): string {
  return `Vaquill_clause_${index + 1}`;
}

/**
 * Actions that mark up the actual Word document (not just the pane): highlight
 * flagged clauses, push rationales into the margin as native comments, drop
 * navigation bookmarks, and tag key fields as content controls.
 */
export function DocumentTools({ redlines }: { redlines: RedlineSuggestion[] }) {
  const [highlighted, setHighlighted] = useState(false);
  const [covered, setCovered] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only clauses with a real anchor can be marked up in place.
  const anchorable = redlines.filter((r) => r.grounding !== "insertion" && r.currentLanguage.trim());

  async function toggleHighlight() {
    setBusy("highlight");
    setError(null);
    setNote(null);
    try {
      if (highlighted) {
        await clearIssueHighlights(anchorable.map((r) => ({ currentLanguage: r.currentLanguage })));
        setHighlighted(false);
        setNote("Cleared the highlights.");
      } else {
        const n = await highlightIssues(
          anchorable.map((r) => ({ currentLanguage: r.currentLanguage, isDealBreaker: r.isDealBreaker })),
        );
        setHighlighted(true);
        setNote(`Highlighted ${n} clause${n === 1 ? "" : "s"} in the document.`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleCoverage() {
    setBusy("coverage");
    setError(null);
    setNote(null);
    try {
      if (covered) {
        await clearCoverageHighlights(anchorable.map((r) => ({ currentLanguage: r.currentLanguage })));
        setCovered(false);
        setNote("Cleared the coverage highlights.");
      } else {
        const n = await highlightCoverage(anchorable.map((r) => ({ currentLanguage: r.currentLanguage })));
        setCovered(true);
        setNote(`Highlighted ${n} covered clause${n === 1 ? "" : "s"} in the document.`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      setNote(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const addComments = () =>
    run("comments", async () => {
      const items = anchorable
        .filter((r) => r.rationale?.trim())
        .map((r) => ({ currentLanguage: r.currentLanguage, rationale: r.rationale }));
      const { inserted, skipped } = await insertRationaleComments(items);
      let msg = `Added ${inserted} rationale comment${inserted === 1 ? "" : "s"} to the document.`;
      if (skipped > 0) {
        msg += ` ${skipped} clause${skipped === 1 ? "" : "s"} could not be commented (in a footnote or header).`;
      }
      return msg;
    });

  const anchor = () =>
    run("anchor", async () => {
      const items = anchorable.map((r) => ({
        name: bookmarkName(redlines.indexOf(r)),
        query: r.currentLanguage,
      }));
      const n = await bookmarkClauses(items);
      return `Anchored ${n} clause${n === 1 ? "" : "s"} with bookmarks.`;
    });

  const tagFields = () =>
    run("fields", async () => {
      const r = await tagKeyFields();
      return `Tagged ${r.dates} date${r.dates === 1 ? "" : "s"}, ${r.amounts} amount${r.amounts === 1 ? "" : "s"}, and ${r.terms} defined term${r.terms === 1 ? "" : "s"}.`;
    });

  return (
    <div className="card doc-tools">
      <h2 className="small muted" style={{ margin: 0 }}>In the document</h2>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Button
          variant={highlighted ? "primary" : "default"}
          size="sm"
          onClick={toggleHighlight}
          loading={busy === "highlight"}
          disabled={!!busy || anchorable.length === 0}
        >
          {highlighted ? "Clear highlights" : "Highlight issues"}
        </Button>
        <Button
          variant={covered ? "primary" : "default"}
          size="sm"
          onClick={toggleCoverage}
          loading={busy === "coverage"}
          disabled={!!busy || anchorable.length === 0}
        >
          {covered ? "Clear coverage" : "Highlight covered clauses"}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={addComments}
          loading={busy === "comments"}
          disabled={!!busy || anchorable.length === 0}
        >
          Add rationale comments
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={anchor}
          loading={busy === "anchor"}
          disabled={!!busy || anchorable.length === 0}
        >
          Anchor clauses
        </Button>
        <Button variant="default" size="sm" onClick={tagFields} loading={busy === "fields"} disabled={!!busy}>
          Tag key fields
        </Button>
      </div>
      {note && <p className="small muted" style={{ margin: 0 }}>{note}</p>}
      {error && <Banner tone="danger">{error}</Banner>}
    </div>
  );
}
