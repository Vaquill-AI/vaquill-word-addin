import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Badge, Banner, Button, Field, SegmentedControl, Spinner } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { CheckIcon, CopyIcon, ArrowLeftIcon } from "@/ui/icons";
import { ApiError, friendlyMessage } from "@/api/errors";
import { insertPassageAtCursor } from "@/office/richInsert";
import { insertCitationFootnote } from "@/office/citations";
import { CaseBrief } from "./CaseBrief";
import {
  searchStatutes,
  getStatuteBody,
  askStatuteSection,
  statuteLabel,
  type StatuteCorpus,
  type StatuteResult,
  type StatuteBody,
  type StatuteAsk,
} from "@/api/research";
import "./research.css";

type CorpusFilter = "" | StatuteCorpus;

const CORPUS_OPTIONS: { value: CorpusFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "usc", label: "USC" },
  { value: "cfr", label: "CFR" },
  { value: "state", label: "State" },
];

type SearchState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; results: StatuteResult[]; total: number }
  | { status: "error"; error: string };

/** Decode the handful of HTML entities the sanitized snippet can carry. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Render the backend's sanitized snippet (whose only markup is <mark>) into React
 * nodes, without dangerouslySetInnerHTML: keep the highlight, strip any other
 * tags. The text is decoded after tag removal so entities render literally.
 */
function renderSnippet(html: string): ReactNode {
  const parts = html.split(/(<mark>.*?<\/mark>)/gi);
  return parts.map((p, i) => {
    const m = p.match(/^<mark>([\s\S]*?)<\/mark>$/i);
    const text = decodeEntities((m ? m[1] : p).replace(/<[^>]*>/g, ""));
    if (!text) return null;
    return m ? <mark key={i}>{text}</mark> : <span key={i}>{text}</span>;
  });
}

/** Human label + tone for a statute status. */
function statusBadge(status: string | null): ReactNode {
  if (!status || status === "in_force") return null;
  return <Badge tone="yellow">{status.replace(/_/g, " ")}</Badge>;
}

type ResearchMode = "statutes" | "cases";

const MODE_OPTIONS: { value: ResearchMode; label: string }[] = [
  { value: "statutes", label: "Statutes" },
  { value: "cases", label: "Cases" },
];

export function ResearchView() {
  const [mode, setMode] = useState<ResearchMode>("statutes");
  const [query, setQuery] = useState("");
  const [corpus, setCorpus] = useState<CorpusFilter>("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [selected, setSelected] = useState<StatuteResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSelected(null);
    setState({ status: "searching" });
    try {
      const res = await searchStatutes(
        trimmed,
        { corpusType: corpus || undefined, pageSize: 25 },
        controller.signal,
      );
      setState({ status: "done", results: res.results, total: res.total });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({
        status: "error",
        error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
      });
    }
  }

  if (mode === "statutes" && selected) {
    return <StatuteReader result={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="stack research">
      <div className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 className="view-title">Legal research</h1>
          <InfoTip text="Search the US statute corpus (USC, CFR, state codes) or look up a case and generate an IRAC brief, then drop it into your document, without leaving Word. Always confirm authority is current before relying on it." />
        </div>
        <SegmentedControl<ResearchMode>
          label="Research mode"
          options={MODE_OPTIONS}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setSelected(null);
          }}
        />
      </div>

      {mode === "cases" ? (
        <CaseBrief />
      ) : (
        <StatuteSearch
          query={query}
          setQuery={setQuery}
          corpus={corpus}
          setCorpus={setCorpus}
          state={state}
          onSearch={() => void run(query)}
          onSelect={setSelected}
        />
      )}
    </div>
  );
}

function StatuteSearch({
  query,
  setQuery,
  corpus,
  setCorpus,
  state,
  onSearch,
  onSelect,
}: {
  query: string;
  setQuery: (q: string) => void;
  corpus: CorpusFilter;
  setCorpus: (c: CorpusFilter) => void;
  state: SearchState;
  onSearch: () => void;
  onSelect: (r: StatuteResult) => void;
}) {
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        Find and quote statutory text. Search USC, CFR, and state codes, then insert the section
        into your document.
      </p>

      <form
        className="stack"
        style={{ gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <Field label="Search statutes">
          <input
            type="search"
            value={query}
            placeholder='e.g. "data breach notification" or 18 USC 1030'
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <div className="field">
          <label>Corpus</label>
          <SegmentedControl<CorpusFilter>
            label="Corpus"
            options={CORPUS_OPTIONS}
            value={corpus}
            onChange={setCorpus}
          />
        </div>
        <Button type="submit" variant="primary" className="btn--cta" loading={state.status === "searching"} disabled={!query.trim()}>
          Search
        </Button>
      </form>

      {state.status === "error" && <Banner tone="danger">{state.error}</Banner>}

      {state.status === "done" && state.results.length === 0 && (
        <Banner tone="info">
          No sections matched. Try fewer or different words, or a specific citation like "42 USC
          1983".
        </Banner>
      )}

      {state.status === "done" && state.results.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="small muted">
            {state.total} result{state.total === 1 ? "" : "s"}
            {state.results.length < state.total ? ` (showing ${state.results.length})` : ""}
          </span>
          <div className="stack" style={{ gap: 6 }}>
            {state.results.map((r) => (
              <button
                key={r.actId}
                type="button"
                className="card research-result"
                onClick={() => onSelect(r)}
              >
                <div className="research-result__top">
                  <span className="research-result__cite">{statuteLabel(r)}</span>
                  {statusBadge(r.actStatus)}
                </div>
                {r.sectionTitle && <span className="research-result__title">{r.sectionTitle}</span>}
                {r.highlightSnippet && (
                  <span className="research-result__snippet small muted">
                    {renderSnippet(r.highlightSnippet)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

type BodyState =
  | { status: "loading" }
  | { status: "ready"; body: StatuteBody }
  | { status: "error"; error: string };

/** Strip tags to plain text (fallback when the body has html but no plain text). */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function StatuteReader({ result, onBack }: { result: StatuteResult; onBack: () => void }) {
  const [state, setState] = useState<BodyState>({ status: "loading" });
  const [inserted, setInserted] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [footnoted, setFootnoted] = useState(false);
  const [footnoting, setFootnoting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    getStatuteBody(result.actId, controller.signal)
      .then((body) => setState({ status: "ready", body }))
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setState({
          status: "error",
          error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
        });
      });
    return () => controller.abort();
  }, [result.actId]);

  const label = statuteLabel(result);
  const text =
    state.status === "ready"
      ? state.body.plain || (state.body.html ? htmlToText(state.body.html) : "")
      : "";

  async function insert() {
    if (!text || inserting) return;
    setInserting(true);
    setNote(null);
    try {
      await insertPassageAtCursor(label, text);
      setInserted(true);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setInserting(false);
    }
  }

  async function footnote() {
    if (footnoting) return;
    setFootnoting(true);
    setNote(null);
    try {
      await insertCitationFootnote(label);
      setFootnoted(true);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setFootnoting(false);
    }
  }

  async function copy() {
    if (!text) return;
    setNote(null);
    try {
      await navigator.clipboard.writeText(`${label}\n\n${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNote("Could not copy to the clipboard.");
    }
  }

  return (
    <div className="stack research">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Button variant="default" size="sm" onClick={onBack} aria-label="Back to results">
          <ArrowLeftIcon size={14} /> Results
        </Button>
        {statusBadge(result.actStatus)}
      </div>

      <div className="stack" style={{ gap: 2 }}>
        <h1 className="research-reader__cite">{label}</h1>
        {result.sectionTitle && <span className="small muted">{result.sectionTitle}</span>}
      </div>

      {state.status === "loading" && (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Loading the section text...</span>
        </div>
      )}
      {state.status === "error" && <Banner tone="danger">{state.error}</Banner>}
      {state.status === "ready" && !text && (
        <Banner tone="warn">{state.body.note || "No text is available for this section."}</Banner>
      )}

      {text && (
        <>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={insert} loading={inserting} disabled={inserted}>
              {inserted ? (
                <>
                  <CheckIcon size={14} /> Inserted at your cursor
                </>
              ) : (
                "Insert into document"
              )}
            </Button>
            <Button
              variant="default"
              onClick={footnote}
              loading={footnoting}
              disabled={footnoted}
              title="Insert the citation as a Word footnote at your cursor"
            >
              {footnoted ? (
                <>
                  <CheckIcon size={14} /> Footnote added
                </>
              ) : (
                "As footnote"
              )}
            </Button>
            <Button variant="default" onClick={copy}>
              {copied ? (
                <>
                  <CheckIcon size={14} /> Copied
                </>
              ) : (
                <>
                  <CopyIcon size={14} /> Copy
                </>
              )}
            </Button>
          </div>
          {note && <span className="small muted">{note}</span>}
          <p className="small muted" style={{ margin: 0 }}>
            Confirm this section is current (not amended or repealed) before relying on it.
          </p>

          <div className="research-reader__body">{text}</div>

          <AskSection actId={result.actId} />
        </>
      )}
    </div>
  );
}

type AskState =
  | { status: "idle" }
  | { status: "asking" }
  | { status: "answered"; ask: StatuteAsk }
  | { status: "error"; error: string };

function AskSection({ actId }: { actId: string }) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function ask() {
    const q = question.trim();
    if (q.length < 3) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "asking" });
    try {
      const res = await askStatuteSection(actId, q, controller.signal);
      setState({ status: "answered", ask: res });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({
        status: "error",
        error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
      });
    }
  }

  return (
    <div className="stack research-ask" style={{ gap: 6 }}>
      <span className="small" style={{ fontWeight: 600 }}>
        Ask about this section
      </span>
      <form
        className="row"
        style={{ gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <input
          type="text"
          className="research-ask__input"
          value={question}
          placeholder="e.g. What is the notification deadline?"
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Button
          type="submit"
          variant="default"
          size="sm"
          loading={state.status === "asking"}
          disabled={question.trim().length < 3}
        >
          Ask
        </Button>
      </form>
      {state.status === "error" && <Banner tone="danger">{state.error}</Banner>}
      {state.status === "answered" && (
        <div className="card card--pad stack" style={{ gap: 4 }}>
          {state.ask.notInSection ? (
            <span className="small muted">
              This section does not appear to answer that. {state.ask.answer}
            </span>
          ) : (
            <span className="small">{state.ask.answer}</span>
          )}
          {state.ask.citation && <span className="small muted">Source: {state.ask.citation}</span>}
        </div>
      )}
    </div>
  );
}
