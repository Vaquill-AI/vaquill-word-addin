import { useState } from "react";
import { Button, Banner, Spinner, LiveRegion } from "@/ui/primitives";
import { FilterChips, type FilterChipOption } from "@/ui/FilterChips";
import { InfoTip } from "@/ui/InfoTip";
import { CheckIcon } from "@/ui/icons";
import { useAuthorityScan } from "./useAuthorityScan";
import { getExtractCoverage } from "./extract";
import { AuthorityItem } from "./AuthorityItem";
import { CitationStyle } from "./CitationStyle";
import { insertTableOfAuthorities } from "@/office/citations";
import type { AuthorityResult } from "@/api/authority";
import "./authority.css";

/** Which summary bucket a citation result falls in (drives the filter chips). */
function groupOf(r: AuthorityResult): "verified" | "no_match" | "other" {
  if (r.verdict === "verified") return "verified";
  if (r.verdict === "no_match") return "no_match";
  return "other";
}

export function AuthorityView() {
  const { state, run, reset } = useAuthorityScan();
  const [toaBusy, setToaBusy] = useState(false);
  const [toaDone, setToaDone] = useState(false);
  // Persistent confirmation after insertion (the table lands at the cursor, which
  // may be off-screen, so a 1.5s button flash is not enough to tell the user it
  // happened). Cleared when a fresh insert starts.
  const [toaNote, setToaNote] = useState<string | null>(null);
  const [toaError, setToaError] = useState<string | null>(null);
  // Active verdict filters. Empty = show everything; otherwise show the union of
  // the selected buckets. The caller owns the set (FilterChips is presentational).
  const [filter, setFilter] = useState<ReadonlySet<string>>(new Set());
  function toggleFilter(key: string) {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const busy = state.status === "reading" || state.status === "scanning";
  // Coverage of the last extraction, so the cap never overstates what we
  // checked. Only trustworthy once extraction has run (scanning / done); during
  // "reading" it still holds the previous scan's numbers.
  const coverage = getExtractCoverage();
  const extracted = state.status === "scanning" || state.status === "done";
  const capped = extracted && coverage.detected > coverage.checked;
  const verified = state.results.filter((r) => r.verdict === "verified");
  const verifiedWithNames = verified.filter((r) => r.caseName);
  const noMatch = state.results.filter((r) => r.verdict === "no_match").length;
  const other = state.results.length - verified.length - noMatch;

  async function insertToA() {
    setToaBusy(true);
    setToaError(null);
    setToaNote(null);
    const n = verifiedWithNames.length;
    try {
      await insertTableOfAuthorities(
        verifiedWithNames.map((r) => ({ caseName: r.caseName!, raw: r.raw })),
      );
      setToaDone(true);
      setTimeout(() => setToaDone(false), 1500);
      setToaNote(
        `Inserted a Table of Authorities with ${n} case${n === 1 ? "" : "s"} at your cursor. Word scrolled to it. Reposition it (e.g. to the front) if you need it elsewhere.`,
      );
    } catch (e) {
      setToaError((e as Error).message);
    } finally {
      setToaBusy(false);
    }
  }

  if (state.status === "idle") {
    return (
      <div className="stack authority-view">
        <div className="stack" style={{ gap: 4 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <h1 className="view-title">Authority check</h1>
            <InfoTip text="Checks every case and statute citation in the document against Vaquill AI's US corpus. Found means a real matching authority exists, not that it is still good law, so confirm its current treatment before relying on it. No match can mean a hallucinated, mis-typed, or unreported citation, so confirm it yourself before you rely on it or file." />
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Verify every case and statute citation in this document against Vaquill AI's US corpus.
            Catch citations that do not resolve to a real authority before you file or send.
          </p>
        </div>
        <Button variant="primary" className="btn--cta" onClick={run}>
          Check citations
        </Button>
      </div>
    );
  }

  return (
    <div className="stack authority-view">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="view-title">Authority check</h1>
        {state.status === "done" && (
          <Button variant="ghost" size="sm" onClick={reset}>
            New check
          </Button>
        )}
      </div>

      {busy && (
        <div className="row authority-progress">
          <Spinner />
          <LiveRegion>
            <span className="small muted">
              {state.status === "reading"
                ? "Reading the document..."
                : `Checking ${state.results.length} of ${state.total} citation${state.total === 1 ? "" : "s"}...`}
            </span>
          </LiveRegion>
        </div>
      )}

      {state.status === "error" && state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.status === "done" && state.error && <Banner tone="warn">{state.error}</Banner>}

      {state.status === "done" && state.total === 0 && (
        <Banner tone="info">
          No case or statute citations were found. This looks for US authority cites such as
          "347 U.S. 483", "18 U.S.C. § 1030", or "Cal. Civ. Code § 1950.5". Contracts and NDAs
          usually have none, so run it on a brief, memo, or opinion that cites case law.
        </Banner>
      )}

      {capped && (
        <Banner tone="warn">
          Showing the first {coverage.checked} of {coverage.detected} citations detected. The
          remaining {coverage.detected - coverage.checked} were not checked to stay within limits.
        </Banner>
      )}

      {state.results.length > 0 &&
        (() => {
          // Clickable filter chips replace the static count badges: tap a bucket
          // to narrow the list to those verdicts (empty selection shows all).
          const chips: FilterChipOption[] = [];
          if (verified.length) chips.push({ key: "verified", label: "Found", count: verified.length, tone: "yellow" });
          if (noMatch) chips.push({ key: "no_match", label: "No match", count: noMatch, tone: "red" });
          if (other) chips.push({ key: "other", label: "Unresolved", count: other, tone: "neutral" });
          const shown =
            filter.size === 0 ? state.results : state.results.filter((r) => filter.has(groupOf(r)));
          return (
            <>
              {chips.length > 1 && (
                <FilterChips
                  options={chips}
                  active={filter}
                  onToggle={toggleFilter}
                  ariaLabel="Filter citations by result"
                />
              )}
              <div className="stack">
                {shown.map((r) => (
                  <AuthorityItem key={r.raw} result={r} />
                ))}
              </div>
            </>
          );
        })()}

      {/* One grouped footer action row: Insert ToA is the single prominent
          action; Check citation style sits beside it as a ghost trigger (and
          expands its own results below when run). No stacked full-width buttons. */}
      {state.status === "done" && state.results.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            {verifiedWithNames.length > 0 && (
              <Button
                variant="default"
                onClick={insertToA}
                loading={toaBusy}
                style={{ flex: "1 1 auto" }}
              >
                {toaDone ? (
                  <>
                    <CheckIcon size={14} /> Table of Authorities inserted
                  </>
                ) : (
                  `Insert Table of Authorities (${verifiedWithNames.length})`
                )}
              </Button>
            )}
            <CitationStyle citations={state.results.map((r) => r.raw)} />
          </div>
          {verifiedWithNames.length > 0 && !toaNote && (
            <span className="small muted">
              Inserts at your cursor. Place the cursor where you want the table (e.g. front matter)
              before inserting.
            </span>
          )}
          {toaNote && (
            <LiveRegion>
              <Banner tone="success">{toaNote}</Banner>
            </LiveRegion>
          )}
          {toaError && <Banner tone="danger">{toaError}</Banner>}
        </div>
      )}
    </div>
  );
}
