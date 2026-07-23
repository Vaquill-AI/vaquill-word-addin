import { useCallback, useEffect, useMemo, useState } from "react";
import { ViewHeader } from "@/ui/ViewHeader";
import { Badge, Banner, Button, IconButton, Spinner } from "@/ui/primitives";
import { ScopedSearchList } from "@/ui/ScopedSearchList";
import { LocateIcon } from "@/ui/icons";
import { readSelectionText } from "@/office/document";
import { readNumberedParagraphs, type NumberedParagraph } from "@/office/structure";
import { locateInDocument } from "@/office/navigate";
import { useOccurrenceCycler } from "@/lib/useOccurrenceCycler";
import { useDocumentAutoRefresh } from "@/lib/useDocumentAutoRefresh";
import { useSelection } from "@/features/tools/useSelection";
import {
  buildGlossary,
  resolveSelectionTerm,
  termOccurrenceVariants,
  type GlossaryEntry,
} from "@/lib/glossary";
import { looksLikeReference, resolveReference, type ResolvedRef } from "@/lib/xrefResolve";
import { errorMessage } from "@/api/errors";
import "./navigator.css";

type Lookup =
  | { kind: "term"; entry: GlossaryEntry }
  | { kind: "ref"; ref: ResolvedRef }
  | { miss: string }
  | null;

function truncate(s: string): string {
  return s.length > 40 ? `${s.slice(0, 40)}...` : s;
}

/**
 * Reading navigator: resolves what you are looking at without scrolling away.
 * Select a defined term to see its definition, or a cross-reference ("Section
 * 7.2", "Exhibit C") to see the clause it points to, and jump to either. Pure
 * client-side (no backend); rebuilds as the document changes.
 */
export function TermNavigatorView() {
  const [paras, setParas] = useState<NumberedParagraph[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<Lookup>(null);
  const [looking, setLooking] = useState(false);

  const entries = useMemo(
    () => (paras ? buildGlossary(paras.map((p) => p.text).join("\n")) : []),
    [paras],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      setParas(await readNumberedParagraphs());
    } catch (e) {
      setError(errorMessage(e));
      setParas([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Rebuild when the document changes; `load` keeps the prior data until the new
  // read resolves, so there is no spinner flash.
  useDocumentAutoRefresh(load);

  // Live lookup: as the reader moves the selection, resolve a term or reference
  // automatically. Silent on a non-match (clears rather than nagging), so it only
  // surfaces something when the selection actually resolves.
  const sel = useSelection();
  useEffect(() => {
    const s = sel.text;
    if (!s) {
      setLookup(null);
      return;
    }
    const term = resolveSelectionTerm(entries, s);
    if (term) {
      setLookup({ kind: "term", entry: term });
      return;
    }
    const ref = paras ? resolveReference(paras, s) : null;
    setLookup(ref ? { kind: "ref", ref } : null);
  }, [sel.text, entries, paras]);

  async function lookupSelection() {
    setLooking(true);
    setLookup(null);
    try {
      const sel = (await readSelectionText()).trim();
      if (!sel) {
        setLookup({ miss: "Select a defined term or a reference in the document, then look it up." });
        return;
      }
      const term = resolveSelectionTerm(entries, sel);
      if (term) {
        setLookup({ kind: "term", entry: term });
        return;
      }
      const ref = paras ? resolveReference(paras, sel) : null;
      if (ref) {
        setLookup({ kind: "ref", ref });
        return;
      }
      const shown = truncate(sel);
      setLookup({
        miss: looksLikeReference(sel)
          ? `"${shown}" points to a target that does not exist in this document.`
          : `"${shown}" is not a defined term or cross-reference here.`,
      });
    } catch (e) {
      setLookup({ miss: errorMessage(e) });
    } finally {
      setLooking(false);
    }
  }

  async function find(text: string) {
    setError(null);
    try {
      await locateInDocument(text);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // Step through every occurrence of a term on each click. Passing the analyzer's
  // plural variants keeps the cycle count equal to the "N uses" badge.
  const { cycle, labelFor, countFor } = useOccurrenceCycler();
  const cycleTerm = (term: string) =>
    void cycle(term, { variants: termOccurrenceVariants(term) }).catch((e) =>
      setError(errorMessage(e)),
    );

  const q = query.trim().toLowerCase();
  const filtered = entries.filter(
    (e) => !q || e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q),
  );

  return (
    <div className="stack navigator">
      <ViewHeader
        tourId="tool-termnav"
        title="Reading navigator"
        onRescan={() => void load()}
        subtitle="Look up a defined term or a cross-reference without leaving the clause you are reading."
        info="Select a defined term to see its definition, or a cross-reference like 'Section 7.2' or 'Exhibit C' to see the clause it points to, then jump to either. Read from the open document. For undefined / duplicate terms or broken references, use the Defined terms and Cross-references tools."
      />

      <div className="stack" style={{ gap: 8 }}>
        <Button
          variant="primary"
          onClick={() => void lookupSelection()}
          loading={looking}
          data-tour="tn-lookup"
        >
          Look up selection
        </Button>

        {lookup && "kind" in lookup && lookup.kind === "term" && (
          <div className="card navigator-hit" data-tour="tn-result">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <strong className="navigator-term">{lookup.entry.term}</strong>
              <IconButton
                label={`Find next occurrence of ${lookup.entry.term}`}
                onClick={() => cycleTerm(lookup.entry.term)}
              >
                <LocateIcon size={13} />
              </IconButton>
            </div>
            <p className="navigator-def">{lookup.entry.definition}</p>
          </div>
        )}

        {lookup && "kind" in lookup && lookup.kind === "ref" && (
          <div className="card navigator-hit" data-tour="tn-result">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <strong className="navigator-term">{lookup.ref.label}</strong>
              <IconButton label={`Go to ${lookup.ref.label}`} onClick={() => void find(lookup.ref.anchor)}>
                <LocateIcon size={13} />
              </IconButton>
            </div>
            <p className="navigator-def">{lookup.ref.targetText}</p>
          </div>
        )}

        {lookup && "miss" in lookup && <Banner tone="info">{lookup.miss}</Banner>}
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {paras === null ? (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Reading defined terms...</span>
        </div>
      ) : (
        <ScopedSearchList
          query={query}
          onQuery={setQuery}
          searchPlaceholder="Search defined terms..."
          ariaLabel="Defined terms"
          isEmpty={filtered.length === 0}
          empty={
            entries.length === 0
              ? "No defined terms found. This document may not use quoted, capitalized definitions."
              : "No terms match your search."
          }
        >
          {filtered.map((e) => (
            <div key={e.term} className="card navigator-row" role="listitem" data-tour="tn-terms">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <strong className="navigator-term">{e.term}</strong>
                <div className="row" style={{ gap: 6, alignItems: "center", flex: "none" }}>
                  <Badge tone="neutral">
                    {labelFor(e.term) ??
                      `${countFor(e.term) ?? e.occurrences} use${
                        (countFor(e.term) ?? e.occurrences) === 1 ? "" : "s"
                      }`}
                  </Badge>
                  <IconButton
                    label={
                      e.occurrences > 1 ? `Find next occurrence of ${e.term}` : `Find ${e.term}`
                    }
                    onClick={() => cycleTerm(e.term)}
                  >
                    <LocateIcon size={13} />
                  </IconButton>
                </div>
              </div>
              <p className="navigator-def small muted">{e.definition}</p>
            </div>
          ))}
        </ScopedSearchList>
      )}
    </div>
  );
}
