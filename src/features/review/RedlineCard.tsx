import { useEffect, useRef, useState } from "react";
import { Badge, Button, IconButton } from "@/ui/primitives";
import { OverflowMenu, type OverflowMenuItem } from "@/ui/OverflowMenu";
import { LocateIcon, CheckIcon, XIcon, UndoIcon, CopyIcon, EditIcon, WandIcon, ChevronIcon } from "@/ui/icons";
import { GroundingBadge } from "./GroundingBadge";
import { InlineDiff } from "./InlineDiff";
import { SeverityBadge } from "./SeverityBadge";
import { severityOf } from "@/lib/severity";
import { applyVerifiedRedline, canApplyInPane, AnchorNotFoundError } from "@/office/redline";
import { insertClauseFormatted } from "@/office/richInsert";
import { selectClauseInDocument } from "@/office/navigate";
import { goToBookmark } from "@/office/bookmarks";
import { rewriteClause } from "@/api/clause-tools";
import { ApiError, friendlyMessage } from "@/api/errors";
import { AddToPlaybook } from "@/features/integration/AddToPlaybook";
import type { RedlineSuggestion } from "@/api/types";
import type { Decision } from "./decisions";
import "./redline-card.css";

const APPROVAL_LABEL: Record<string, string> = { manager: "Manager", partner: "Partner", gc: "GC" };

// Rationale longer than this collapses behind a "Why this change" toggle so the
// card stays scannable; shorter ones stay inline.
const RATIONALE_INLINE_MAX = 140;

type ProposedView = "redline" | "final";

export function RedlineCard({
  redline,
  index,
  decision,
  onDecision,
}: {
  redline: RedlineSuggestion;
  index: number;
  decision: Decision;
  onDecision: (index: number, decision: Decision) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Proposed-language state. `edited` is null until the user changes it, so an
  // untouched card applies the original suggestion verbatim.
  const [edited, setEdited] = useState<string | null>(null);
  const [view, setView] = useState<ProposedView>("redline");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [refining, setRefining] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  // Keep keyboard focus in the card after it resolves/restores instead of
  // dropping to <body> (WCAG 2.4.3). `actedRef` ensures we only move focus for
  // a decision the user made here, not for a bulk "Apply all" from the action bar.
  const focusRef = useRef<HTMLDivElement>(null);
  const actedRef = useRef(false);
  useEffect(() => {
    if (!actedRef.current) return;
    actedRef.current = false;
    focusRef.current?.focus();
  }, [decision]);

  // Move focus into the editor when it opens.
  const editRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  const isInsertion = redline.grounding === "insertion";
  const applicable = isInsertion || canApplyInPane(redline);
  const style = { animationDelay: `${Math.min(index, 10) * 28}ms` };

  // The language we will actually apply / copy: the user's edit if any, else
  // the original suggestion.
  const proposed = edited ?? redline.proposedLanguage;
  const isEdited = edited !== null && edited !== redline.proposedLanguage;

  function decide(next: Decision) {
    actedRef.current = true;
    onDecision(index, next);
  }

  async function locate() {
    if (isInsertion) return;
    setNote(null);
    try {
      // Prefer the bookmark anchor if one was placed for this clause: it survives
      // edits that would defeat a text search. Falls back to searching the text.
      if (await goToBookmark(`Vaquill_clause_${index + 1}`)) return;
      const found = await selectClauseInDocument(redline.currentLanguage);
      if (!found) setNote("Could not locate this clause in the document.");
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  async function accept() {
    setBusy(true);
    setNote(null);
    try {
      if (isInsertion) await insertClauseFormatted(redline.clauseName, proposed);
      else await applyVerifiedRedline({ ...redline, proposedLanguage: proposed });
      decide("accepted");
    } catch (e) {
      setNote(
        e instanceof AnchorNotFoundError
          ? "Could not find this clause verbatim. Use Download redlined copy instead."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyProposed() {
    try {
      await navigator.clipboard.writeText(proposed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNote("Could not copy.");
    }
  }

  // ---- Edit-before-apply -------------------------------------------------
  function startEdit() {
    setDraft(proposed);
    setNote(null);
    setEditing(true);
  }
  function saveEdit() {
    const next = draft.trim();
    if (!next) return;
    setEdited(next);
    setEditing(false);
  }
  function cancelEdit() {
    setEditing(false);
  }
  function revertEdit() {
    setEdited(null);
  }
  async function refine() {
    setRefining(true);
    setNote(null);
    try {
      const base = draft.trim() || proposed;
      const r = await rewriteClause(base, {
        mode: "rewrite",
        tone: "balanced",
        instruction: "Tighten this contract language and improve legal precision without changing its meaning.",
      });
      if (r.rewritten?.trim()) setDraft(r.rewritten.trim());
      else setNote("The AI refine returned nothing usable. Edit manually.");
    } catch (e) {
      setNote(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setRefining(false);
    }
  }

  // ---- Collapsed resolved states -----------------------------------------
  if (decision === "accepted") {
    return (
      <div className="card redline redline--accepted" ref={focusRef} tabIndex={-1}>
        <span className="redline__resolved-icon redline__resolved-icon--ok">
          <CheckIcon />
        </span>
        <span className="redline__resolved-name">{redline.clauseName}</span>
        <span className="small muted">{isEdited ? "Applied (edited)" : "Applied"}</span>
        {!isInsertion && (
          <IconButton label="Find in document" onClick={locate}>
            <LocateIcon size={14} />
          </IconButton>
        )}
      </div>
    );
  }

  if (decision === "rejected") {
    return (
      <div className="card redline redline--rejected" ref={focusRef} tabIndex={-1}>
        <span className="redline__resolved-name muted">{redline.clauseName}</span>
        <span className="small muted">Dismissed</span>
        <Button variant="ghost" size="sm" onClick={() => decide("pending")}>
          <UndoIcon size={13} /> Restore
        </Button>
      </div>
    );
  }

  const rationale = redline.rationale?.trim();
  const collapseRationale = (rationale?.length ?? 0) > RATIONALE_INLINE_MAX;

  // Secondary actions live behind the kebab so the primary row stays scannable.
  // "Copy proposed" is redundant when the card already shows it as the
  // non-applicable fallback button, so only offer it in the menu when the
  // primary action is Accept/Insert.
  const overflowItems: OverflowMenuItem[] = applicable
    ? [{ label: "Copy proposed", icon: <CopyIcon size={14} />, onSelect: copyProposed }]
    : [];

  return (
    <div className="card redline redline--enter" style={style} ref={focusRef} tabIndex={-1}>
      <div className="redline__head">
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className="redline__num">{index + 1}</span>
          <strong>{redline.clauseName}</strong>
        </div>
        {!isInsertion && (
          <IconButton label="Find in document" onClick={locate}>
            <LocateIcon size={14} />
          </IconButton>
        )}
      </div>

      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        <SeverityBadge severity={severityOf(redline)} />
        {redline.isDealBreaker && <Badge tone="red">Deal-breaker</Badge>}
        {redline.approvalLevel && redline.approvalLevel !== "none" && (
          <Badge tone="yellow">{APPROVAL_LABEL[redline.approvalLevel] ?? redline.approvalLevel}</Badge>
        )}
        <GroundingBadge grounding={redline.grounding} />
        {isEdited && <Badge tone="brand">Edited</Badge>}
      </div>

      {redline.sectionReference && <p className="small muted redline__ref">{redline.sectionReference}</p>}

      {editing ? (
        <div className="redline__edit">
          <textarea
            ref={editRef}
            className="redline__editbox"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(10, Math.max(3, draft.split("\n").length + 1))}
            aria-label="Edit the proposed language"
          />
          <div className="row redline__edit-actions" style={{ gap: 6, flexWrap: "wrap" }}>
            <Button variant="ghost" size="sm" onClick={refine} loading={refining} disabled={refining}>
              <WandIcon size={13} /> AI refine
            </Button>
            <Button variant="primary" size="sm" onClick={saveEdit} disabled={!draft.trim() || refining}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={refining}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          {!isInsertion && (
            <div className="redline__viewtoggle" role="group" aria-label="Preview as">
              <button
                type="button"
                className={`redline__viewbtn${view === "redline" ? " redline__viewbtn--on" : ""}`}
                aria-pressed={view === "redline"}
                onClick={() => setView("redline")}
              >
                Redline
              </button>
              <button
                type="button"
                className={`redline__viewbtn${view === "final" ? " redline__viewbtn--on" : ""}`}
                aria-pressed={view === "final"}
                onClick={() => setView("final")}
              >
                Final
              </button>
            </div>
          )}

          {isInsertion || view === "final" ? (
            <p className="redline__text redline__text--ins">{proposed}</p>
          ) : (
            <InlineDiff before={redline.currentLanguage} after={proposed} />
          )}
        </>
      )}

      {rationale &&
        (collapseRationale ? (
          <div className="redline__why">
            <button
              type="button"
              className="redline__why-toggle"
              aria-expanded={showWhy}
              onClick={() => setShowWhy((v) => !v)}
            >
              Why this change
              <span className={`redline__why-chev${showWhy ? " redline__why-chev--open" : ""}`} aria-hidden>
                <ChevronIcon size={13} />
              </span>
            </button>
            {showWhy && <p className="small muted" style={{ margin: "4px 0 0" }}>{rationale}</p>}
          </div>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>{rationale}</p>
        ))}

      {!editing && (
        <div className="redline__actions">
          {applicable ? (
            <Button variant="primary" size="sm" onClick={accept} loading={busy}>
              <CheckIcon size={14} /> {isInsertion ? "Insert clause" : "Accept"}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={copyProposed}>
              {copied ? (
                <>
                  <CheckIcon size={14} /> Copied
                </>
              ) : (
                <>
                  <CopyIcon size={14} /> Copy proposed
                </>
              )}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={startEdit}>
            <EditIcon size={13} /> Edit
          </Button>
          {isEdited && (
            <Button variant="ghost" size="sm" onClick={revertEdit}>
              <UndoIcon size={13} /> Revert
            </Button>
          )}
          <IconButton label="Dismiss" tone="red" onClick={() => decide("rejected")}>
            <XIcon size={14} />
          </IconButton>
          {overflowItems.length > 0 && <OverflowMenu label="More actions" items={overflowItems} />}
          {!applicable && <span className="small muted">Verify manually</span>}
          {note && (
            <span className={`small ${note.includes("Could not") ? "redline__note--err" : "muted"}`}>
              {note}
            </span>
          )}
        </div>
      )}

      <div className="redline__foot">
        <AddToPlaybook redline={redline} />
      </div>
    </div>
  );
}
