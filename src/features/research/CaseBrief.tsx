import { useRef, useState } from "react";
import { Banner, Button, Field } from "@/ui/primitives";
import { CheckIcon, CopyIcon } from "@/ui/icons";
import { Markdown } from "@/features/assistant/markdown";
import { ApiError, friendlyMessage } from "@/api/errors";
import { insertHtmlAtCursor } from "@/office/richInsert";
import { resolveCase, getCaseBrief, markdownToSafeHtml, type CaseMatch } from "@/api/research";

type ResolveState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "resolved"; match: CaseMatch }
  | { status: "not_found" }
  | { status: "error"; error: string };

type BriefState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "ready"; brief: string }
  | { status: "error"; error: string };

function caseTitle(m: CaseMatch): string {
  return m.caseName || `Case ${m.clusterId}`;
}

/**
 * Case-law research, brief-only: resolve a citation to a case, then generate and
 * insert an IRAC brief (an LLM transformation). We never surface the raw opinion
 * text (attribution + resale-risk); only the transformed brief.
 */
export function CaseBrief() {
  const [citation, setCitation] = useState("");
  const [resolveState, setResolveState] = useState<ResolveState>({ status: "idle" });
  const [briefState, setBriefState] = useState<BriefState>({ status: "idle" });
  const [inserted, setInserted] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function resetBrief() {
    abortRef.current?.abort();
    setBriefState({ status: "idle" });
    setInserted(false);
    setNote(null);
  }

  async function lookup() {
    const c = citation.trim();
    if (!c) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    resetBrief();
    setResolveState({ status: "resolving" });
    try {
      const match = await resolveCase(c, controller.signal);
      setResolveState(match ? { status: "resolved", match } : { status: "not_found" });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setResolveState({
        status: "error",
        error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
      });
    }
  }

  async function generate(match: CaseMatch) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setInserted(false);
    setNote(null);
    setBriefState({ status: "generating" });
    try {
      const res = await getCaseBrief(match.clusterId, controller.signal);
      if (!res.brief.trim()) {
        setBriefState({ status: "error", error: "No brief could be generated for this case." });
        return;
      }
      setBriefState({ status: "ready", brief: res.brief });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setBriefState({
        status: "error",
        error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
      });
    }
  }

  async function insert(match: CaseMatch, brief: string) {
    if (inserting) return;
    setInserting(true);
    setNote(null);
    try {
      const heading = `<h3>${escapeForHeading(caseTitle(match))} — Case Brief</h3>`;
      await insertHtmlAtCursor(heading + markdownToSafeHtml(brief));
      setInserted(true);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setInserting(false);
    }
  }

  async function copy(match: CaseMatch, brief: string) {
    setNote(null);
    try {
      await navigator.clipboard.writeText(`${caseTitle(match)} — Case Brief\n\n${brief}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNote("Could not copy to the clipboard.");
    }
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="small muted" style={{ margin: 0 }}>
        Enter a case citation to pull the case and generate an IRAC brief (Issue, Rule, Application,
        Conclusion) you can insert into your document.
      </p>

      <form
        className="stack"
        style={{ gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          void lookup();
        }}
      >
        <Field label="Case citation">
          <input
            type="text"
            value={citation}
            placeholder="e.g. 347 U.S. 483 or Brown v. Board of Education"
            onChange={(e) => setCitation(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          className="btn--cta"
          loading={resolveState.status === "resolving"}
          disabled={!citation.trim()}
        >
          Look up case
        </Button>
      </form>

      {resolveState.status === "error" && <Banner tone="danger">{resolveState.error}</Banner>}
      {resolveState.status === "not_found" && (
        <Banner tone="info">
          No matching case found for that citation. Check the citation, or try the case name.
        </Banner>
      )}

      {resolveState.status === "resolved" && (
        <div className="card card--pad stack" style={{ gap: 6 }}>
          <div className="stack" style={{ gap: 1 }}>
            <span className="research-reader__cite">{caseTitle(resolveState.match)}</span>
            <span className="small muted">
              {[resolveState.match.court, resolveState.match.year].filter(Boolean).join(" · ") ||
                "US case"}
            </span>
          </div>

          {briefState.status !== "ready" && (
            <Button
              variant="primary"
              onClick={() => void generate(resolveState.match)}
              loading={briefState.status === "generating"}
            >
              Generate IRAC brief
            </Button>
          )}
          {briefState.status === "generating" && (
            <span className="small muted">
              Generating the brief. The first time for a case can take up to a minute.
            </span>
          )}
          {briefState.status === "error" && <Banner tone="danger">{briefState.error}</Banner>}

          {briefState.status === "ready" && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <Button
                  variant="primary"
                  onClick={() => void insert(resolveState.match, briefState.brief)}
                  loading={inserting}
                  disabled={inserted}
                >
                  {inserted ? (
                    <>
                      <CheckIcon size={14} /> Inserted at your cursor
                    </>
                  ) : (
                    "Insert brief into document"
                  )}
                </Button>
                <Button variant="default" onClick={() => void copy(resolveState.match, briefState.brief)}>
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
                An AI-generated brief. Read the full opinion and confirm the case is good law before
                relying on it.
              </p>
              <div className="research-reader__body">
                <Markdown text={briefState.brief} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Minimal escape for the case title we place inside our own <h3>. */
function escapeForHeading(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
