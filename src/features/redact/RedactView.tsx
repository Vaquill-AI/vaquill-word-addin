import { useMemo, useState } from "react";
import { ViewHeader } from "@/ui/ViewHeader";
import { Banner, Button, Spinner, LiveRegion, SegmentedControl, ConfirmDialog } from "@/ui/primitives";
import { FilterChips, type FilterChipOption } from "@/ui/FilterChips";
import { StatusGroup } from "@/ui/StatusGroup";
import type { RedactScope } from "@/office/redact";
import { CATEGORIES } from "./categories";
import type { RedactCandidate } from "./detect";
import { CandidateRow } from "./CandidateRow";
import { useRedact, type RedactState } from "./useRedact";
import "./redact.css";

const SCOPE_OPTIONS: { value: RedactScope; label: string }[] = [
  { value: "document", label: "Whole document" },
  { value: "selection", label: "Selection" },
];

const METADATA_NOTE =
  "Redaction removes the text from the body. Before sending, run Word's Inspect Document (File → Info → Check for Issues) to clear residual metadata, comments, and properties.";

function defaultCategories(): Set<string> {
  return new Set(CATEGORIES.filter((c) => c.defaultOn).map((c) => c.key));
}

export function RedactView() {
  const { state, scan, setConfirmed, apply, reset } = useRedact();
  const [categories, setCategories] = useState<Set<string>>(defaultCategories);
  const [scope, setScope] = useState<RedactScope>("document");

  function toggleCategory(key: string) {
    const next = new Set(categories);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCategories(next);
  }

  const categoryChips: FilterChipOption[] = CATEGORIES.map((c) => ({ key: c.key, label: c.label }));

  // ---- Idle: choose categories + scan ------------------------------------
  if (state.status === "idle" || state.status === "error") {
    return (
      <div className="stack redact-view">
        <ViewHeader
        title="Redact"
        info="Finds sensitive values and replaces the ones you confirm with a solid black bar. The original text is deleted, not hidden behind a mask, so it cannot be recovered from the file. Keep an unredacted copy first."
        subtitle="Find sensitive data (IDs, contact, financial, and AI-detected names, organizations, and locations) and replace what you confirm with a black bar."
      />

        {state.status === "error" && <Banner tone="danger">{state.error}</Banner>}

        <div className="stack" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 600 }}>Scope</span>
          <SegmentedControl
            options={SCOPE_OPTIONS}
            value={scope}
            onChange={setScope}
            label="Redaction scope"
          />
          <p className="small muted" style={{ margin: 0 }}>
            {scope === "selection"
              ? "Only the text you have highlighted is scanned and redacted."
              : "The whole document is scanned and redacted."}
          </p>
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 600 }}>Categories to scan</span>
          <FilterChips
            options={categoryChips}
            active={categories}
            onToggle={toggleCategory}
            ariaLabel="Categories to scan"
          />
        </div>

        <Banner tone="warn">
          Redaction replaces the text with a black bar and permanently deletes the original. Keep an
          unredacted copy; Ctrl+Z can undo it in Word.
        </Banner>

        <Button
          variant="primary"
          className="btn--cta"
          onClick={() => void scan(categories, scope)}
          disabled={categories.size === 0}
        >
          {scope === "selection" ? "Scan selection" : "Scan document"}
        </Button>
        <p className="small muted" style={{ margin: 0 }}>
          Names, organizations, and locations are found with AI when you select those categories.
        </p>
      </div>
    );
  }

  // ---- Scanning ----------------------------------------------------------
  if (state.status === "scanning") {
    return (
      <div className="stack redact-view">
        <h1 className="view-title">Redact</h1>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner />
          <span className="small muted">Scanning the document...</span>
        </div>
      </div>
    );
  }

  // ---- Applying ----------------------------------------------------------
  if (state.status === "applying") {
    const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
    return (
      <div className="stack redact-view">
        <h1 className="view-title">Redact</h1>
        <LiveRegion>
          <span className="small muted">
            Redacting {state.done} of {state.total}...
          </span>
        </LiveRegion>
        <div className="redact-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span className="redact-progress__fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  // ---- Done --------------------------------------------------------------
  if (state.status === "done") {
    return (
      <div className="stack redact-view">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="view-title">Redact</h1>
          <Button variant="ghost" size="sm" onClick={reset}>
            New scan
          </Button>
        </div>
        {state.redacted > 0 ? (
          <Banner tone="info">
            Redacted {state.redacted} occurrence{state.redacted === 1 ? "" : "s"} from the document.
          </Banner>
        ) : (
          <Banner tone="info">Nothing was redacted.</Banner>
        )}
        {state.notFound.length > 0 && (
          <p className="small muted" style={{ margin: 0 }}>
            {state.notFound.length} value{state.notFound.length === 1 ? "" : "s"} could not be located
            (the text may have changed since the scan).
          </p>
        )}
        <Banner tone="warn">{METADATA_NOTE}</Banner>
      </div>
    );
  }

  // ---- Review ------------------------------------------------------------
  return <RedactReview state={state} onScanNew={reset} onConfirm={setConfirmed} onApply={apply} />;
}

function RedactReview({
  state,
  onScanNew,
  onConfirm,
  onApply,
}: {
  state: Extract<RedactState, { status: "review" }>;
  onScanNew: () => void;
  onConfirm: (confirmed: ReadonlySet<string>) => void;
  onApply: (values: string[], scope: RedactScope) => void;
}) {
  const { candidates, confirmed, aiPending } = state;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const scopeLabel = state.scope === "selection" ? "Selection" : "Whole document";

  const byCategory = useMemo(() => {
    const map = new Map<string, RedactCandidate[]>();
    for (const c of candidates) {
      const list = map.get(c.category) ?? [];
      list.push(c);
      map.set(c.category, list);
    }
    return map;
  }, [candidates]);

  function toggleOne(text: string) {
    const next = new Set(confirmed);
    if (next.has(text)) next.delete(text);
    else next.add(text);
    onConfirm(next);
  }

  function setCategory(catKey: string, on: boolean) {
    const next = new Set(confirmed);
    for (const c of byCategory.get(catKey) ?? []) {
      if (on) next.add(c.text);
      else next.delete(c.text);
    }
    onConfirm(next);
  }

  function setAll(on: boolean) {
    onConfirm(on ? new Set(candidates.map((c) => c.text)) : new Set());
  }

  const confirmedValues = candidates.filter((c) => confirmed.has(c.text)).map((c) => c.text);
  const confirmedCount = confirmedValues.length;
  const occurrences = candidates
    .filter((c) => confirmed.has(c.text))
    .reduce((sum, c) => sum + c.count, 0);

  if (candidates.length === 0) {
    return (
      <div className="stack redact-view">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="view-title">Redact</h1>
          <Button variant="ghost" size="sm" onClick={onScanNew}>
            New scan
          </Button>
        </div>
        {aiPending ? (
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <Spinner />
            <span className="small muted">Detecting names, organizations, and locations...</span>
          </div>
        ) : (
          <Banner tone="info">
            Redact finds sensitive values (IDs, contact details, financial data, and names) so you
            can remove them for good. Nothing matched the categories you chose. Add more categories,
            or widen the scope to the whole document, then scan again.
          </Banner>
        )}
      </div>
    );
  }

  return (
    <div className="stack redact-view">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="view-title">Redact</h1>
        <Button variant="ghost" size="sm" onClick={onScanNew}>
          New scan
        </Button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Found {candidates.length} value{candidates.length === 1 ? "" : "s"}, each shown in context.
        Uncheck any you want to keep, then redact.
      </p>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="small muted">
          {confirmedCount} of {candidates.length} selected
        </span>
        <button
          type="button"
          className="redact-linkbtn"
          onClick={() => setAll(confirmedCount !== candidates.length)}
        >
          {confirmedCount === candidates.length ? "Clear all" : "Select all"}
        </button>
      </div>
      {aiPending && (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner />
          <span className="small muted">Detecting names, organizations, and locations...</span>
        </div>
      )}

      <div className="stack" style={{ gap: 8 }}>
        {CATEGORIES.filter((cat) => byCategory.has(cat.key)).map((cat) => {
          const items = byCategory.get(cat.key) ?? [];
          const allOn = items.every((c) => confirmed.has(c.text));
          return (
            <StatusGroup key={cat.key} tone="neutral" label={cat.label} count={items.length}>
              <div className="row redact-group-actions">
                <button
                  type="button"
                  className="redact-linkbtn"
                  onClick={() => setCategory(cat.key, !allOn)}
                >
                  {allOn ? "Skip all" : "Redact all"}
                </button>
              </div>
              {items.map((c) => (
                <CandidateRow
                  key={c.text}
                  candidate={c}
                  confirmed={confirmed.has(c.text)}
                  onToggle={() => toggleOne(c.text)}
                />
              ))}
            </StatusGroup>
          );
        })}
      </div>

      <div className="action-bar">
        <div className="action-bar__row">
          <Button
            variant="primary"
            block
            onClick={() => setConfirmOpen(true)}
            disabled={confirmedCount === 0}
          >
            {confirmedCount === 0
              ? "Nothing selected"
              : `Redact ${confirmedCount} value${confirmedCount === 1 ? "" : "s"} (${occurrences} occurrence${occurrences === 1 ? "" : "s"})`}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        title="Redact selected values?"
        confirmLabel={`Redact ${confirmedCount} value${confirmedCount === 1 ? "" : "s"}`}
        cancelLabel="Cancel"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onApply(confirmedValues, state.scope);
        }}
        body={
          <div className="stack" style={{ gap: 8 }}>
            <p style={{ margin: 0 }}>
              Permanently remove {confirmedCount} value{confirmedCount === 1 ? "" : "s"} ({occurrences}{" "}
              occurrence{occurrences === 1 ? "" : "s"}) from the document?
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              Scope: {scopeLabel}.
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              This cannot be undone from the pane; Ctrl+Z in Word may reverse it. Keep an unredacted
              copy.
            </p>
          </div>
        }
      />
    </div>
  );
}
