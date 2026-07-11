import { useState } from "react";
import { Button, Banner, Badge, Field, Spinner } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { CheckIcon, CopyIcon } from "@/ui/icons";
import {
  generateDraft,
  DRAFT_CATEGORIES,
  DRAFT_CATEGORY_GROUPS,
  DRAFT_TONES,
  type DraftResult,
  type DraftIssue,
} from "@/api/drafting";
import { insertDraftFormatted } from "@/office/richInsert";
import { JURISDICTIONS, labelOf } from "@/features/review/constants";
import { SaveToVaquill } from "@/features/integration/SaveToVaquill";
import { ApiError, friendlyMessage } from "@/api/errors";
import "./draft.css";

type Status = "idle" | "generating" | "done" | "error";

/** Maps an issue severity to a Badge tone + label for the review queue. */
function severityBadge(severity: DraftIssue["severity"]): { tone: "red" | "yellow" | "neutral"; label: string } {
  if (severity === "error") return { tone: "red", label: "Error" };
  if (severity === "info") return { tone: "neutral", label: "Info" };
  return { tone: "yellow", label: "Warning" };
}

export function DraftView() {
  const [category, setCategory] = useState("nda");
  const [title, setTitle] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [tone, setTone] = useState("balanced");
  const [instructions, setInstructions] = useState("");

  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inserted, setInserted] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  async function generate() {
    setStatus("generating");
    setError(null);
    setResult(null);
    setInserted(false);
    setCopied(false);
    setCopyNote(null);
    try {
      const r = await generateDraft({
        category,
        title: title.trim() || labelOf(DRAFT_CATEGORIES, category),
        // The backend requires a governing law for US drafts. JURISDICTIONS
        // values are US state codes (or "" for general); "" maps to the
        // "federal" sentinel (multi-state / federal). Omitting it 422s.
        governingLawState: jurisdiction || "federal",
        tone,
        specialInstructions: instructions,
      });
      setResult(r);
      setStatus("done");
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
      setStatus("error");
    }
  }

  async function insert() {
    if (!result || inserting) return;
    setInserting(true);
    setError(null);
    try {
      await insertDraftFormatted({
        title: result.title,
        sections: result.sections,
        fullText: result.fullText,
      });
      setInserted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInserting(false);
    }
  }

  async function copy() {
    if (!result) return;
    setCopyNote(null);
    try {
      await navigator.clipboard.writeText(result.fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyNote("Could not copy to the clipboard.");
    }
  }

  function reset() {
    setStatus("idle");
    setResult(null);
    setError(null);
    setInserted(false);
    setCopyNote(null);
  }

  if (status === "done" && result) {
    return (
      <div className="stack draft-view">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 className="view-title">Draft</h1>
          <Button variant="ghost" size="sm" onClick={reset}>
            New draft
          </Button>
        </div>

        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontSize: 14, margin: 0 }}>{result.title}</h2>
          {typeof result.qualityScore === "number" && (
            <Badge tone={result.qualityScore >= 0.75 ? "green" : result.qualityScore >= 0.5 ? "yellow" : "red"}>
              Quality {Math.round(result.qualityScore * 100)}%
            </Badge>
          )}
        </div>

        {result.sections.length > 0 && (
          <div className="stack" style={{ gap: 2 }}>
            <h3 className="small muted">Sections</h3>
            <ol className="draft-outline small">
              {result.sections.map((s) => (
                <li key={s.id}>{s.title}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="draft-preview">{result.fullText}</div>

        {result.issues && result.issues.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <h3 className="small muted">Review before sending</h3>
            <ul className="draft-issues stack" style={{ gap: 6 }}>
              {result.issues.map((issue, i) => {
                const badge = severityBadge(issue.severity);
                return (
                  <li key={`${issue.code}-${i}`} className="draft-issue">
                    <div className="row" style={{ gap: 6, alignItems: "center" }}>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      {issue.sectionTitle && <span className="small muted">{issue.sectionTitle}</span>}
                    </div>
                    <p className="small" style={{ margin: "2px 0 0" }}>
                      {issue.message}
                    </p>
                    {issue.suggestedFix && (
                      <p className="small muted" style={{ margin: "2px 0 0" }}>
                        Suggested fix: {issue.suggestedFix}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {result.authorities && result.authorities.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <h3 className="small muted">Sources</h3>
            <ul className="draft-sources stack" style={{ gap: 4 }}>
              {result.authorities.map((a, i) => (
                <li key={`${a.citation}-${i}`} className="draft-source small">
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noreferrer">
                      {a.citation}
                      {a.pinpoint ? ` ${a.pinpoint}` : ""}
                    </a>
                  ) : (
                    <span>
                      {a.citation}
                      {a.pinpoint ? ` ${a.pinpoint}` : ""}
                    </span>
                  )}
                  {!a.verified && <span className="small muted"> (unverified)</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="draft-actions">
          <Button variant="primary" block onClick={insert} disabled={inserted} loading={inserting}>
            {inserted ? (
              <>
                <CheckIcon size={14} /> Inserted into document
              </>
            ) : (
              "Insert into document"
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

        {error && <Banner tone="danger">{error}</Banner>}
        {copyNote && <span className="small muted">{copyNote}</span>}

        <SaveToVaquill mode="draft" draft={result} />
      </div>
    );
  }

  return (
    <div className="stack draft-view">
      <div className="stack" style={{ gap: 4 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 className="view-title">Draft</h1>
          <InfoTip text="Generates a first-draft agreement from your inputs and inserts it into the document. Treat it as a starting point, not a final draft: review the language, run it through Review, and get the required sign-off before you send it." />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Generate a first-draft agreement and insert it into this document.
        </p>
      </div>

      <Field label="Document type">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {DRAFT_CATEGORY_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      <Field label="Title">
        <input
          value={title}
          placeholder={`e.g. Mutual ${labelOf(DRAFT_CATEGORIES, category)} - Acme and Beta`}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <Field label="Governing law">
        <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
          {JURISDICTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Tone">
        <select value={tone} onChange={(e) => setTone(e.target.value)}>
          {DRAFT_TONES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Key terms and instructions">
        <textarea
          value={instructions}
          placeholder="e.g. Parties: Acme Inc. (Disclosing) and Beta LLC (Receiving). Mutual, 3-year term, carve-outs for independently developed information."
          onChange={(e) => setInstructions(e.target.value)}
        />
      </Field>

      <Button variant="primary" block onClick={generate} loading={status === "generating"}>
        Generate draft
      </Button>

      {status === "generating" && (
        <div className="row draft-loading">
          <Spinner />
          <span className="small muted">Drafting your agreement. This can take up to a minute.</span>
        </div>
      )}

      {status === "error" && error && <Banner tone="danger">{error}</Banner>}
    </div>
  );
}
