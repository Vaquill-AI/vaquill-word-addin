import { useState } from "react";
import { Button, Banner, Field, Spinner } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { CheckIcon, CopyIcon } from "@/ui/icons";
import { generateDraft, DRAFT_CATEGORIES, type DraftResult } from "@/api/drafting";
import { insertDraftAtCursor } from "@/office/draft";
import { JURISDICTIONS, labelOf } from "@/features/review/constants";
import { ApiError, friendlyMessage } from "@/api/errors";
import "./draft.css";

type Status = "idle" | "generating" | "done" | "error";

export function DraftView() {
  const [category, setCategory] = useState("nda");
  const [title, setTitle] = useState("");
  const [jurisdiction, setJurisdiction] = useState("US");
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
        governingLawState: jurisdiction === "US" ? undefined : jurisdiction,
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
      await insertDraftAtCursor(result.fullText);
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

        <h2 style={{ fontSize: 14 }}>{result.title}</h2>

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
          {DRAFT_CATEGORIES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
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
