import { useCallback, useRef, useState } from "react";
import { copyPlain } from "@/lib/clipboard";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { ViewHeader } from "@/ui/ViewHeader";
import { Button, Banner, Badge, Field, Spinner, SegmentedControl, IconButton } from "@/ui/primitives";
import { Combobox } from "@/ui/Combobox";
import { CheckIcon, CopyIcon, FillIcon, ArrowLeftIcon, TermsIcon, PlusIcon } from "@/ui/icons";
import { ImproveButton } from "@/ui/ImproveButton";
import { improveDraftingPrompt } from "@/api/improve-prompt";
import {
  generateDraft,
  generateDraftQueued,
  cancelDraftGeneration,
  isGenerationCancelled,
  uploadDraftReference,
  DRAFT_CATEGORIES,
  DRAFT_TONES,
  type DraftParams,
  type DraftResult,
  type DraftIssue,
  type GenerationProgress,
} from "@/api/drafting";
import { attachAccept } from "@/api/context";
import { useAttachments, MAX_ATTACHMENTS } from "@/features/assistant/useAttachments";
import { AttachmentChips } from "@/features/assistant/AttachmentChips";
import { insertDraftFormatted } from "@/office/richInsert";
import { JURISDICTIONS, labelOf } from "@/features/review/constants";
import { getReviewPrefs } from "@/lib/prefs";
import { SaveToVaquill } from "@/features/integration/SaveToVaquill";
import { useAppNav } from "@/app/nav";
import { config } from "@/config";
import { TransplantView } from "@/features/transplant/TransplantView";
import { FillView } from "@/features/fill/FillView";
import { ClauseLibraryView } from "@/features/clauses/ClauseLibraryView";
import { type DraftMode } from "./mode";
import { ApiError, errorMessage } from "@/api/errors";
import "./draft.css";

type Status = "idle" | "generating" | "done" | "error";

/** Maps an issue severity to a Badge tone + label for the review queue. */
function severityBadge(severity: DraftIssue["severity"]): { tone: "red" | "yellow" | "neutral"; label: string } {
  if (severity === "error") return { tone: "red", label: "Error" };
  if (severity === "info") return { tone: "neutral", label: "Info" };
  return { tone: "yellow", label: "Warning" };
}

export function DraftView() {
  const { navigate } = useAppNav();
  // Draft has two modes: Generate a first draft from inputs, or Templates,
  // browse the firm library and insert one. Generate owns the toggle; Templates
  // renders its own copy so both surfaces switch from the same control.
  const [mode, setMode] = useState<DraftMode>("generate");
  const [category, setCategory] = useState("nda");
  const [title, setTitle] = useState("");
  const [jurisdiction, setJurisdiction] = useState(getReviewPrefs().jurisdiction || "");
  const [tone, setTone] = useState("balanced");
  const [instructions, setInstructions] = useState("");
  // One-click "Improve": rewrites the brief into a sharper instruction (cheap,
  // does not consume the draft quota). `improveNote` reports a no-op or an error.
  const [improving, setImproving] = useState(false);
  const [improveNote, setImproveNote] = useState<string | null>(null);

  // Reference documents ground the draft: upload each to /upload-reference and
  // pass the returned ids to generate. The backend injects their text into every
  // section prompt.
  const refs = useAttachments(
    useCallback(async (file) => {
      const r = await uploadDraftReference(file);
      return { refId: r.id };
    }, []),
  );

  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inserted, setInserted] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);

  // Lets us abort the local poll and stop the backend worker on Cancel.
  const abortRef = useRef<AbortController | null>(null);
  const draftIdRef = useRef<string | null>(null);

  // Sharpen the brief in place. Preserves the user's facts and leaves anything
  // missing as bracketed placeholders (the backend is instructed not to invent).
  async function improvePrompt() {
    const base = instructions.trim();
    if (!base || improving) return;
    setImproving(true);
    setImproveNote(null);
    try {
      const r = await improveDraftingPrompt(base);
      if (r.changed && r.improved.trim()) {
        setInstructions(r.improved.trim());
        setImproveNote(r.notes?.trim() || "Brief sharpened. Review the bracketed placeholders.");
      } else {
        setImproveNote("This brief is already clear. No changes made.");
      }
    } catch (e) {
      setImproveNote(errorMessage(e));
    } finally {
      setImproving(false);
    }
  }

  async function generate() {
    setStatus("generating");
    setError(null);
    setResult(null);
    setInserted(false);
    setCopied(false);
    setCopyNote(null);
    setProgress(null);

    const controller = new AbortController();
    abortRef.current = controller;
    draftIdRef.current = null;

    const params: DraftParams = {
      category,
      title: title.trim() || labelOf(DRAFT_CATEGORIES, category),
      // The backend requires a governing law for US drafts. JURISDICTIONS
      // values are US state codes (or "" for general); "" maps to the
      // "federal" sentinel (multi-state / federal). Omitting it 422s.
      governingLawState: jurisdiction || "federal",
      tone,
      specialInstructions: instructions,
      referenceDocumentIds: refs.refIds(),
    };

    try {
      const r = await generateDraftQueued(params, {
        signal: controller.signal,
        onStart: (id) => {
          draftIdRef.current = id;
        },
        onProgress: ({ progress: p }) => setProgress(p),
      });
      setResult(r);
      setStatus("done");
    } catch (e) {
      // User pressed Stop (local abort or backend-tagged cancellation).
      if (isGenerationCancelled(e)) {
        setStatus("idle");
        return;
      }
      // Older backends without the durable queue: fall back to the synchronous
      // endpoint, but only if the job never started (so we never double-charge).
      if (!draftIdRef.current && e instanceof ApiError && (e.status === 404 || e.status === 405)) {
        try {
          const r = await generateDraft(params);
          setResult(r);
          setStatus("done");
          return;
        } catch (e2) {
          setError(errorMessage(e2));
          setStatus("error");
          return;
        }
      }
      setError(errorMessage(e));
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }

  function cancelGeneration() {
    const id = draftIdRef.current;
    abortRef.current?.abort();
    if (id) void cancelDraftGeneration(id);
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
      setError(errorMessage(e));
    } finally {
      setInserting(false);
    }
  }

  async function copy() {
    if (!result) return;
    setCopyNote(null);
    if (await copyPlain(result.fullText)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setCopyNote("Copy was blocked. Select the text and use Ctrl+C.");
    }
  }

  function reset() {
    setStatus("idle");
    setResult(null);
    setError(null);
    setInserted(false);
    setCopyNote(null);
    setProgress(null);
    refs.clear();
  }

  // Transplant, Fill, and Clauses are secondary "bring content in" surfaces. They
  // keep their own titles, so Draft just adds a back control to return to Generate.
  if (mode === "transplant" || mode === "fill" || mode === "clauses") {
    return (
      <div className="stack draft-view">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMode("generate")}
          style={{ alignSelf: "flex-start" }}
          aria-label="Back to Draft"
        >
          <ArrowLeftIcon size={14} /> Draft
        </Button>
        {mode === "transplant" ? (
          <TransplantView />
        ) : mode === "fill" ? (
          <FillView />
        ) : (
          <ClauseLibraryView />
        )}
      </div>
    );
  }

  if (status === "done" && result) {
    return (
      <div className="stack draft-view">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 className="view-title">Draft</h1>
          <Button variant="ghost" size="sm" onClick={reset}>
            <PlusIcon size={13} /> New draft
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
          <Button variant="primary" className="btn--cta" onClick={insert} disabled={inserted} loading={inserting}>
            {inserted ? (
              <>
                <CheckIcon size={14} /> Inserted into document
              </>
            ) : (
              "Insert into document"
            )}
          </Button>
          <IconButton label={copied ? "Copied" : "Copy"} onClick={copy}>
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </IconButton>
          {/* Generate -> review loop: once the draft is in the document, hand it
              straight to Review (which reads the open document). */}
          {inserted && (
            <Button
              variant="default"
              onClick={() => navigate("review", { kind: "reviewContract" })}
            >
              Review this draft
            </Button>
          )}
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
        <ViewHeader
        title="Draft"
        info="Generates a first-draft agreement from your inputs and inserts it into the document. Treat it as a starting point, not a final draft: review the language, run it through Review, and get the required sign-off before you send it."
      />
        <p className="small muted" style={{ margin: 0 }}>
          Generate a first-draft agreement and insert it into this document.
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          <a href={`${config.appBase}/templates`} target="_blank" rel="noreferrer">
            Browse templates
          </a>{" "}
          or{" "}
          <a href={`${config.appBase}/drafting`} target="_blank" rel="noreferrer">
            open your saved drafts
          </a>{" "}
          in Vaquill AI.
        </p>
      </div>

      <div className="form-grid">
        {/* The two dropdowns pair on one row; Title (free text) gets its own full
            row so it never truncates at intermediate pane widths. */}
        <Field label="Document type">
          <Combobox
            value={category}
            onChange={setCategory}
            options={DRAFT_CATEGORIES}
            ariaLabel="Document type"
          />
        </Field>

        <Field label="Governing law">
          <Combobox
            value={jurisdiction}
            onChange={setJurisdiction}
            options={JURISDICTIONS}
            ariaLabel="Governing law"
          />
        </Field>

        <div className="form-grid__full">
          <Field label="Title">
            <input
              value={title}
              placeholder={`e.g. Mutual ${labelOf(DRAFT_CATEGORIES, category)} - Acme and Beta`}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        </div>

        {/* Tone is a short, fixed enum (Protective / Balanced / Permissive), so it
            reads as a segmented control spanning the full grid width, not a dropdown. */}
        <div className="form-grid__full stack" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 600 }}>
            Tone
          </span>
          <SegmentedControl
            options={DRAFT_TONES.map((o) => ({ value: o.value, label: o.label }))}
            value={tone}
            onChange={setTone}
            label="Drafting tone"
          />
        </div>
      </div>

      <Field
        label="Key terms and instructions"
        action={
          <ImproveButton
            improving={improving}
            disabled={!instructions.trim()}
            onClick={improvePrompt}
          />
        }
      >
        <AutoTextarea
          value={instructions}
          placeholder="e.g. Parties: Acme Inc. (Disclosing) and Beta LLC (Receiving). Mutual, 3-year term, carve-outs for independently developed information."
          onChange={(e) => setInstructions(e.target.value)}
        />
      </Field>
      {improveNote && (
        <span className="small muted" style={{ marginTop: -4 }}>
          {improveNote}
        </span>
      )}

      <div className="attach">
        <div className="attach__head">
          <span className="small" style={{ fontWeight: 600 }}>
            Reference documents (optional)
          </span>
          <span className="small muted">
            Ground the draft in an existing agreement, term sheet, or precedent. Party names,
            defined terms, and clauses are carried across.
          </span>
        </div>
        <AttachmentChips files={refs.files} onRemove={refs.remove} />
        <label className={`attach__add${refs.atCap ? " attach__add--disabled" : ""}`}>
          <input
            type="file"
            accept={attachAccept()}
            multiple
            disabled={refs.atCap}
            className="attach__input"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              for (const file of picked) refs.add(file);
              e.target.value = "";
            }}
          />
          <span aria-hidden>+</span> Attach reference
        </label>
        <p className="attach__hint small muted">
          {refs.atCap
            ? `Attachment limit reached (${MAX_ATTACHMENTS} files).`
            : `PDF, Word, or text. Up to ${MAX_ATTACHMENTS} files.`}
        </p>
      </div>

      <Button variant="primary" className="btn--cta" onClick={generate} loading={status === "generating"}>
        Generate draft
      </Button>

      {status === "generating" && (
        <div className="stack draft-loading">
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <Spinner />
            <span className="small muted">
              {progress?.label || "Drafting your agreement. This can take up to a minute."}
            </span>
          </div>

          {(() => {
            const step = progress?.stepIndex;
            const total = progress?.totalSteps;
            if (typeof step === "number" && typeof total === "number" && total > 0) {
              return (
                <span className="small muted">
                  Step {Math.min(step + 1, total)} of {total}
                </span>
              );
            }
            return null;
          })()}

          {(() => {
            const sections = progress?.sections;
            if (!Array.isArray(sections) || sections.length === 0) return null;
            return (
              <ul className="draft-outline small" style={{ listStyle: "none", paddingLeft: 0 }}>
                {sections.map((s, i) => (
                  <li key={`${s.title ?? "section"}-${i}`}>
                    <span className="row" style={{ gap: 4, alignItems: "center" }}>
                      {s.status === "completed" && <CheckIcon size={12} />}
                      <span className={s.status === "completed" ? undefined : "muted"}>
                        {s.title || "Section"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            );
          })()}

          <Button variant="ghost" size="sm" onClick={cancelGeneration}>
            Cancel
          </Button>
        </div>
      )}

      {status === "error" && error && <Banner tone="danger">{error}</Banner>}

      {status === "idle" && (
        <div className="draft-bringin stack" style={{ gap: 6 }}>
          <span className="small muted">Or bring content in from another document</span>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Button variant="default" size="sm" onClick={() => setMode("transplant")}>
              <CopyIcon size={14} /> Pull a clause
            </Button>
            <Button variant="default" size="sm" onClick={() => setMode("fill")}>
              <FillIcon size={14} /> Fill placeholders
            </Button>
            <Button variant="default" size="sm" onClick={() => setMode("clauses")}>
              <TermsIcon size={14} /> Clause library
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
