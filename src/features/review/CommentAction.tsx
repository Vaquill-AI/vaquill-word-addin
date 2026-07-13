import { useState } from "react";
import { Banner, Button, IconButton } from "@/ui/primitives";
import { CheckIcon, CopyIcon } from "@/ui/icons";
import { insertCommentOnSelection } from "@/office/selection";
import { selectClauseInDocument } from "@/office/navigate";
import { goToBookmark } from "@/office/bookmarks";
import { rewriteClause } from "@/api/clause-tools";
import { ApiError, friendlyMessage } from "@/api/errors";
import type { RedlineSuggestion } from "@/api/types";
import "./comment-action.css";

/**
 * Attach the rationale for a redline as a comment, in one of two registers.
 *
 *  - "counterparty": a diplomatic, send-ready justification. Written into the
 *    document as a NATIVE Word comment (propose-then-confirm: we generate the
 *    text, preview it, and only insert on an explicit click).
 *  - "internal": candid internal strategy. Word comments travel with the .docx,
 *    so an internal note must NEVER be written into the shared file or it would
 *    leak our strategy to the other side. The internal register therefore has
 *    NO insert control at all: the note lives only in this pane (React state +
 *    an opt-in clipboard copy). `insertCommentOnSelection` below is reachable
 *    only from the counterparty path, which is the guarantee that internal
 *    strategy never ships in the document.
 */

type Register = "counterparty" | "internal";

interface Draft {
  register: Register;
  text: string;
}

const INSTRUCTIONS: Record<Register, string> = {
  counterparty:
    "Draft a short, diplomatic comment addressed to the other side's counsel that " +
    "justifies this proposed change. Keep it professional, collaborative, and " +
    "send-ready (2 to 4 sentences). Do not reveal internal strategy, negotiating " +
    "leverage, walk-away points, or fallback positions. Return only the comment text.",
  internal:
    "Draft a short, candid internal note for our own deal team about this proposed " +
    "change. Be direct about our rationale, our leverage, our priorities, and any " +
    "fallback position. This note is for internal eyes only and must never be shared " +
    "with the other side. Return only the note text.",
};

/** Compose the clause context we hand to the generator for either register. */
function buildContext(redline: RedlineSuggestion, proposed: string): string {
  const parts = [`Clause: ${redline.clauseName}`];
  if (redline.sectionReference) parts.push(`Section: ${redline.sectionReference}`);
  const current = redline.currentLanguage?.trim();
  if (current) parts.push(`Current language: ${current}`);
  parts.push(`Proposed language: ${proposed}`);
  const rationale = redline.rationale?.trim();
  if (rationale) parts.push(`Reason for the change: ${rationale}`);
  return parts.join("\n");
}

// Local inline glyphs, kept in-file so the shared icon set stays lean.
function CommentGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function LockGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function CommentAction({
  redline,
  index,
  proposed,
  allowCounterparty,
}: {
  redline: RedlineSuggestion;
  index: number;
  proposed: string;
  /** Counterparty comments anchor to existing clause text; suppress for insertions. */
  allowCounterparty: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [generating, setGenerating] = useState<Register | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [inserting, setInserting] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(register: Register) {
    setPicking(false);
    setError(null);
    setInserted(false);
    setDraft(null);
    setCopied(false);
    setGenerating(register);
    try {
      const r = await rewriteClause(buildContext(redline, proposed), {
        mode: "rewrite",
        tone: "balanced",
        instruction: INSTRUCTIONS[register],
      });
      const text = r.rewritten?.trim();
      if (text) setDraft({ register, text });
      else setError("Could not draft a comment. Please try again.");
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setGenerating(null);
    }
  }

  // The ONLY path that writes to the .docx. Guarded to the counterparty register
  // and unreachable for an internal note (the internal panel renders no insert
  // control), so internal strategy can never be committed to the shared file.
  async function insertCounterparty() {
    if (draft?.register !== "counterparty") return;
    setInserting(true);
    setError(null);
    try {
      // Anchor on the clause bookmark if present (survives edits), else locate the
      // clause text. Both select the range, so the comment lands on the clause.
      const located =
        (await goToBookmark(`Vaquill_clause_${index + 1}`)) ||
        (await selectClauseInDocument(redline.currentLanguage));
      if (!located) {
        setError("Could not locate this clause in the document to attach the comment.");
        return;
      }
      await insertCommentOnSelection(draft.text);
      setInserted(true);
      setDraft(null);
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setInserting(false);
    }
  }

  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to the clipboard.");
    }
  }

  function dismissDraft() {
    setDraft(null);
    setError(null);
  }

  const isInternal = draft?.register === "internal";

  return (
    <div className="cmt">
      <div className="row cmt__bar" style={{ gap: 6, flexWrap: "wrap" }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          loading={generating !== null}
          disabled={generating !== null}
        >
          <CommentGlyph /> Comment
        </Button>
        {picking && (
          <div className="cmt__picker" role="group" aria-label="Draft a comment">
            {allowCounterparty && (
              <Button variant="ghost" size="sm" onClick={() => generate("counterparty")}>
                For the counterparty
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => generate("internal")}>
              Internal note
            </Button>
          </div>
        )}
      </div>

      {inserted && (
        <p className="small muted cmt__done">
          <CheckIcon size={13} /> Comment attached to the clause.
        </p>
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      {draft && (
        <div className={`cmt__draft${isInternal ? " cmt__draft--internal" : ""}`}>
          <div className="cmt__draft-head">
            {isInternal ? (
              <span className="cmt__tag cmt__tag--internal">
                <LockGlyph /> Internal - not added to the document
              </span>
            ) : (
              <span className="cmt__tag cmt__tag--sendable">Counterparty comment - send-ready</span>
            )}
          </div>

          <p className="cmt__draft-body">{draft.text}</p>

          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {!isInternal && (
              <Button
                variant="primary"
                size="sm"
                onClick={insertCounterparty}
                loading={inserting}
                disabled={inserting}
              >
                <CommentGlyph /> Insert as comment
              </Button>
            )}
            <IconButton label={copied ? "Copied" : "Copy"} onClick={copyDraft}>
              {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
            </IconButton>
            <Button variant="ghost" size="sm" onClick={dismissDraft} disabled={inserting}>
              Dismiss
            </Button>
          </div>

          {isInternal && (
            <p className="small muted cmt__internal-hint">
              This note stays in the pane. It is never written into the document, so it cannot
              travel to the other side.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
