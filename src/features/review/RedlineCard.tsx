import { useEffect, useRef, useState } from "react";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { Badge, Button, IconButton } from "@/ui/primitives";
import { OverflowMenu, type OverflowMenuItem } from "@/ui/OverflowMenu";
import { SplitButton } from "@/ui/SplitButton";
import { LocateIcon, CheckIcon, XIcon, UndoIcon, CopyIcon, EditIcon, WandIcon, ChevronIcon, AssistantIcon, ShieldCheckIcon } from "@/ui/icons";
import { GroundingBadge } from "./GroundingBadge";
import { InlineDiff } from "./InlineDiff";
import { SeverityBadge } from "./SeverityBadge";
import { severityOf } from "@/lib/severity";
import { toClauseTypeKey } from "@/lib/strings";
import { applyVerifiedRedline, canApplyInPane, AnchorNotFoundError } from "@/office/redline";
import { insertClauseFormatted } from "@/office/richInsert";
import { selectClauseInDocument } from "@/office/navigate";
import { goToBookmark } from "@/office/bookmarks";
import { rewriteClause } from "@/api/clause-tools";
import { streamClauseFix } from "@/api/contract-review";
import { recordRedlineFeedback } from "@/api/feedback";
import { errorMessage } from "@/api/errors";
import { AddToPlaybook } from "@/features/integration/AddToPlaybook";
import { useAppNav } from "@/app/nav";
import { CommentAction } from "./CommentAction";
import type { RedlineSuggestion } from "@/api/types";
import type { Decision } from "./decisions";
import "./redline-card.css";

type Feedback = "up" | "down";

// Local thumb glyphs for the lightweight quality feedback control. Kept in-file
// so the shared icon set stays lean.
function ThumbUpIcon({ size = 14 }: { size?: number }) {
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
      <path d="M7 10v11" />
      <path d="M7 10 11 3a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 18 21H7" />
    </svg>
  );
}

function ThumbDownIcon({ size = 14 }: { size?: number }) {
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
      <path d="M17 14V3" />
      <path d="M17 14 13 21a2 2 0 0 1-2-2v-4H6a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 7 3h10" />
    </svg>
  );
}

const APPROVAL_LABEL: Record<string, string> = { manager: "Manager", partner: "Partner", gc: "GC" };

// Rationale longer than this collapses behind a "Why this change" toggle so the
// card stays scannable; shorter ones stay inline.
const RATIONALE_INLINE_MAX = 140;

// ---- Change-intent subtitle ---------------------------------------------
// A short "what this edit does" line distilled client-side from the rationale.
// There is no backend-provided title, so this is a best-effort summary and is
// deliberately conservative: when the distillation is empty, too short, or just
// echoes the clause name, we omit the line rather than show something misleading.
// Shown only when the full rationale is collapsed, and never clipped.

// Leading filler that frames the redline ("This change...", "We recommend...")
// rather than describing the edit. Stripped (case-insensitively) so the phrase
// leads with the action. Longest-first is not required since we loop until
// stable, but each entry ends in a space so we only strip whole words.
const INTENT_FILLER = [
  "this change ",
  "this redline ",
  "this edit ",
  "this revision ",
  "this amendment ",
  "this addition ",
  "this provision ",
  "this section ",
  "this clause ",
  "the clause ",
  "the current clause ",
  "the current language ",
  "the current ",
  "the existing ",
  "the provision ",
  "the proposed change ",
  "the proposed language ",
  "the proposed ",
  "the revised language ",
  "the revised ",
  "we recommend ",
  "we suggest ",
  "we propose ",
  "recommend ",
  "suggest ",
  "propose ",
];

// Normalize for a loose equality check against the clause name.
function normalizeIntent(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// First sentence of the rationale: first non-empty line, up to the first
// sentence terminator. Avoids regex lookbehind for older WebView engines.
function firstSentenceOf(rationale: string): string {
  const line = rationale.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
  const match = line.match(/^(.*?[.!?])(?:\s|$)/);
  return (match?.[1] ?? line).trim();
}

// Distill a concise change-intent phrase, or null when nothing honest and
// useful can be produced.
function distillIntent(rationale: string, clauseName: string): string | null {
  const trimmed = rationale.trim();
  if (!trimmed) return null;

  let phrase = firstSentenceOf(trimmed);

  // Strip leading filler repeatedly (e.g. "This change: we recommend ...").
  let stripping = true;
  while (stripping) {
    stripping = false;
    const lower = phrase.toLowerCase();
    for (const filler of INTENT_FILLER) {
      if (lower.startsWith(filler)) {
        phrase = phrase.slice(filler.length);
        stripping = true;
        break;
      }
    }
    // Drop any leading punctuation left behind by a stripped filler word.
    phrase = phrase.replace(/^[\s,;:.\-]+/, "");
  }

  // Drop a single trailing sentence period (keep ? / ! which carry meaning).
  phrase = phrase.replace(/\.$/, "").trim();
  if (phrase.length < 12) return null;

  // Do not echo the clause name: omit when the phrase equals it or is just the
  // clause name plus a trivial suffix ("Non-compete" vs "Non-compete clause").
  const normPhrase = normalizeIntent(phrase);
  const normClause = normalizeIntent(clauseName);
  if (normClause) {
    if (normPhrase === normClause) return null;
    if (normPhrase.startsWith(normClause) && normPhrase.length - normClause.length < 8) return null;
  }

  // We show the full first sentence rather than clipping it: the intent line only
  // appears when the rationale is hidden behind the "Why this change" toggle, so a
  // clipped-with-"..." summary would defeat the purpose. The first sentence is
  // naturally short; nothing is truncated.

  // Read as a title: capitalize the first letter if it is lowercase.
  const first = phrase.charAt(0);
  if (first && first === first.toLowerCase() && first !== first.toUpperCase()) {
    phrase = first.toUpperCase() + phrase.slice(1);
  }

  return phrase;
}

type ProposedView = "redline" | "final";

/** The review setup a "Draft a stronger fix" needs to draft against the right
 *  playbook position. Supplied only on the Review surface; when absent the
 *  agentic-fix action is hidden (the card is being reused elsewhere). */
export interface RedlineFixContext {
  userSide?: string;
  paperSide?: "own" | "counterparty";
  playbookId?: string;
}

export function RedlineCard({
  redline,
  index,
  decision,
  onDecision,
  applyBusy,
  setApplyBusy,
  fixContext,
}: {
  redline: RedlineSuggestion;
  index: number;
  decision: Decision;
  onDecision: (index: number, decision: Decision) => void;
  /** Shared apply lock (see ReviewView) so this card and "Apply all" cannot run
   *  concurrently. Defaults keep the card usable outside the review surface. */
  applyBusy?: boolean;
  setApplyBusy?: (b: boolean) => void;
  /** Present on the Review surface: enables "Draft a stronger fix". */
  fixContext?: RedlineFixContext;
}) {
  const { navigate } = useAppNav();
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

  // Per-card regenerate + quality feedback.
  const [regenerating, setRegenerating] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Agentic "Draft a stronger fix": the improved, grounded, gated redline the
  // loop produces replaces the displayed suggestion in-card. `fixStep` carries
  // the live reasoning phase; `fixCtl` lets the user cancel the stream.
  const [improved, setImproved] = useState<RedlineSuggestion | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixStep, setFixStep] = useState<{ message: string; progress: number } | null>(null);
  const fixCtl = useRef<AbortController | null>(null);
  useEffect(() => () => fixCtl.current?.abort(), []);

  // The suggestion the card actually shows and applies: the agentic improvement
  // if one was drafted, else the original. Everything below renders from this so
  // the grounding badge, rationale, and approval level reflect the real content.
  const active = improved ?? redline;

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

  const isInsertion = active.grounding === "insertion";
  const applicable = isInsertion || canApplyInPane(active);
  const style = { animationDelay: `${Math.min(index, 10) * 28}ms` };

  // The language we will actually apply / copy: the user's edit if any, else
  // the active (possibly improved) suggestion.
  const proposed = edited ?? active.proposedLanguage;
  const isEdited = edited !== null && edited !== active.proposedLanguage;

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
      const found = await selectClauseInDocument(active.currentLanguage);
      if (!found) setNote("Could not locate this clause in the document.");
    } catch (e) {
      setNote(errorMessage(e));
    }
  }

  // Apply the (possibly edited) proposal. `tracked` (default) lands it as a
  // reviewable tracked change; the split-button's "Apply clean" passes false to
  // apply it directly without tracking.
  async function applyWith(tracked: boolean) {
    // Respect the shared apply lock so this can't race "Apply all" (which would
    // double-append an insertion-type clause).
    if (busy || applyBusy) return;
    setBusy(true);
    setApplyBusy?.(true);
    setNote(null);
    try {
      if (isInsertion) await insertClauseFormatted(active.clauseName, proposed, { tracked });
      else await applyVerifiedRedline({ ...active, proposedLanguage: proposed }, { tracked });
      decide("accepted");
    } catch (e) {
      setNote(
        e instanceof AnchorNotFoundError
          ? "Could not find this clause verbatim. Use Download redlined copy instead."
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
      setApplyBusy?.(false);
    }
  }
  const accept = () => applyWith(true);

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
      setNote(errorMessage(e));
    } finally {
      setRefining(false);
    }
  }

  // ---- Regenerate + quality feedback -------------------------------------
  // Produce an alternative proposed language. We store it as an edit so it flows
  // through the existing edited/proposed state: the "Edited" badge shows and the
  // user can keep it or Revert back to the original suggestion.
  async function regenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setNote(null);
    try {
      const r = await rewriteClause(proposed, {
        mode: "rewrite",
        tone: "balanced",
        instruction:
          "Provide an alternative phrasing of this contract language that achieves the same " +
          "protective intent with different wording. Return only the revised clause.",
      });
      const next = r.rewritten?.trim();
      if (next) setEdited(next);
      else setNote("Could not generate an alternative. Try again.");
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setRegenerating(false);
    }
  }

  // ---- Agentic "Draft a stronger fix" -----------------------------------
  // Stream the plan->draft->validate->repair->critique->gate loop and adopt its
  // grounded, gated result in-card. Only offered when fixContext is present.
  async function runDraftFix() {
    if (fixing || !fixContext) return;
    const ctl = new AbortController();
    fixCtl.current = ctl;
    setFixing(true);
    setFixStep(null);
    setNote(null);
    try {
      await streamClauseFix(
        {
          clauseName: active.clauseName,
          clauseType: toClauseTypeKey(active.clauseName),
          currentLanguage: active.currentLanguage,
          userSide: fixContext.userSide,
          paperSide: fixContext.paperSide,
          playbookId: fixContext.playbookId,
        },
        {
          signal: ctl.signal,
          onThinking: (t) => setFixStep({ message: t.message, progress: t.progress }),
          onResult: (out) => {
            if (out.noChangeNeeded) {
              setNote("This clause already meets your playbook position. No change needed.");
              return;
            }
            // Adopt the improved redline; drop any stale manual edit so the card
            // shows the drafted language verbatim.
            setEdited(null);
            setImproved(out.redline);
          },
        },
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setNote(errorMessage(e));
    } finally {
      setFixing(false);
      setFixStep(null);
      fixCtl.current = null;
    }
  }

  // Optimistic local toggle, plus a fire-and-forget POST so the rating persists.
  // We only record when the thumb is turned ON (not when toggled back off), and
  // swallow any failure: a failed POST must never disrupt the review.
  function rate(next: Feedback) {
    setFeedback((cur) => {
      const turningOn = cur !== next;
      if (turningOn) {
        void recordRedlineFeedback({
          rating: next,
          clauseName: redline.clauseName || undefined,
          rationale: redline.rationale?.trim() || undefined,
        }).catch(() => {
          // Best-effort: the optimistic UI already reflects the rating.
        });
      }
      return turningOn ? next : null;
    });
  }

  // ---- Collapsed resolved states -----------------------------------------
  if (decision === "accepted") {
    return (
      <div className="card redline redline--accepted" ref={focusRef} tabIndex={-1}>
        <span className="redline__resolved-icon redline__resolved-icon--ok">
          <CheckIcon />
        </span>
        <span className="redline__resolved-name">{active.clauseName}</span>
        <span className="small muted">
          {isEdited ? "Applied (edited)" : improved ? "Applied (stronger fix)" : "Applied"}
        </span>
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
        <span className="redline__resolved-name muted">{active.clauseName}</span>
        <span className="small muted">Dismissed</span>
        <Button variant="ghost" size="sm" onClick={() => decide("pending")}>
          <UndoIcon size={13} /> Restore
        </Button>
      </div>
    );
  }

  const rationale = active.rationale?.trim();
  const collapseRationale = (rationale?.length ?? 0) > RATIONALE_INLINE_MAX;
  const intent = distillIntent(rationale ?? "", active.clauseName);

  // Secondary actions live behind the kebab so the primary row stays scannable
  // (Accept + Dismiss + kebab). Edit and Revert moved in here too, since the
  // visible row was crowding.
  const overflowItems: OverflowMenuItem[] = [];
  overflowItems.push({ label: "Edit language", icon: <EditIcon size={14} />, onSelect: startEdit });
  if (isEdited) {
    overflowItems.push({ label: "Revert to original", icon: <UndoIcon size={14} />, onSelect: revertEdit });
  }
  // "Copy proposed" is redundant when the card already shows it as the
  // non-applicable fallback button, so only offer it in the menu when the
  // primary action is Accept/Insert.
  if (applicable) {
    overflowItems.push({ label: "Copy proposed", icon: <CopyIcon size={14} />, onSelect: copyProposed });
  }
  // The agentic fix is a strictly stronger engine than "Regenerate" (which uses
  // the plain rewrite). Offered first, and only on the Review surface.
  if (fixContext) {
    overflowItems.push({
      label: improved ? "Draft another strong fix" : "Draft a stronger fix (AI)",
      icon: <ShieldCheckIcon size={14} />,
      onSelect: () => void runDraftFix(),
    });
  }
  overflowItems.push({
    label: "Regenerate suggestion",
    icon: <WandIcon size={14} />,
    onSelect: regenerate,
  });
  overflowItems.push({
    label: "Ask the assistant about this",
    icon: <AssistantIcon size={14} />,
    onSelect: () =>
      navigate("assistant", {
        kind: "assistantAsk",
        prompt: `Should I accept the proposed change to the "${active.clauseName}" clause? Briefly explain the risk it addresses and the tradeoff of accepting versus rejecting it.`,
        autoSend: true,
        // This is a question about the open document itself, so answer from the
        // document, not the corpus / matter docs / web (which only add latency
        // and off-topic citations for an accept/reject call).
        documentOnly: true,
      }),
  });
  overflowItems.push({
    label: feedback === "up" ? "Good suggestion (selected)" : "Good suggestion",
    icon: <ThumbUpIcon size={14} />,
    onSelect: () => rate("up"),
  });
  overflowItems.push({
    label: feedback === "down" ? "Needs work (selected)" : "Needs work",
    icon: <ThumbDownIcon size={14} />,
    onSelect: () => rate("down"),
  });

  return (
    <div className="card redline redline--enter" style={style} ref={focusRef} tabIndex={-1}>
      <div className="redline__head">
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "flex-start", minWidth: 0 }}>
          <span className="redline__num">{index + 1}</span>
          <div className="redline__titlewrap">
            <strong>{active.clauseName}</strong>
            {/* Status badges live in the header, next to the title, so severity /
                grounding / approval read at a glance without a separate row. */}
            <div className="redline__badges">
              <SeverityBadge severity={severityOf(active)} />
              {active.isDealBreaker && <Badge tone="red">Deal-breaker</Badge>}
              {active.approvalLevel && active.approvalLevel !== "none" && (
                <Badge tone="yellow">{APPROVAL_LABEL[active.approvalLevel] ?? active.approvalLevel}</Badge>
              )}
              <GroundingBadge grounding={active.grounding} />
              {improved && <Badge tone="green">Stronger fix</Badge>}
              {isEdited && <Badge tone="brand">Edited</Badge>}
            </div>
            {/* The distilled intent is only a useful subtitle when the full
                rationale is hidden behind the "Why this change" toggle; when the
                rationale is shown inline below, this line just duplicates it (and
                its "..." clipping is what looked truncated), so we omit it. */}
            {intent && collapseRationale && <span className="redline__intent">{intent}</span>}
          </div>
        </div>
        {!isInsertion && (
          <IconButton label="Find in document" onClick={locate}>
            <LocateIcon size={14} />
          </IconButton>
        )}
      </div>

      {active.sectionReference && <p className="small muted redline__ref">{active.sectionReference}</p>}

      {editing ? (
        <div className="redline__edit">
          <AutoTextarea
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

          {isInsertion ? (
            // A brand-new clause is an insertion in full, so green is honest here.
            <p className="redline__text redline__text--ins">{proposed}</p>
          ) : view === "final" ? (
            // "Final" is the clean finished clause as it will read AFTER accepting:
            // neutral, not tinted green. Green marks only actual insertions (in the
            // Redline diff). Green-washing the whole paragraph made Final look
            // barely different from Redline and implied every word was new.
            <p className="redline__text redline__text--final">{proposed}</p>
          ) : (
            <InlineDiff before={active.currentLanguage} after={proposed} />
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

      {active.fallbackPosition?.trim() && (
        <p className="small redline__fallback" style={{ margin: 0 }}>
          <strong>Fallback if rejected:</strong>{" "}
          <span className="muted">{active.fallbackPosition.trim()}</span>
        </p>
      )}

      {fixing && (
        <div
          className="redline__fixing row"
          style={{ gap: 8, alignItems: "center" }}
          role="status"
          aria-live="polite"
        >
          <span className="streaming__pulse" aria-hidden />
          <span className="small">{fixStep?.message ?? "Drafting a stronger fix..."}</span>
          <Button
            variant="ghost"
            size="sm"
            style={{ marginLeft: "auto" }}
            onClick={() => fixCtl.current?.abort()}
          >
            Cancel
          </Button>
        </div>
      )}

      {!editing && (
        <div className="redline__actions">
          {applicable ? (
            <SplitButton
              label={isInsertion ? "Insert clause" : "Accept"}
              icon={<CheckIcon size={14} />}
              onClick={accept}
              loading={busy}
              disabled={(applyBusy && !busy) || fixing}
              menuLabel="More apply options"
              items={[
                {
                  label: "Apply clean (no tracked change)",
                  icon: <CheckIcon size={14} />,
                  onSelect: () => void applyWith(false),
                },
              ]}
            />
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
          <IconButton label="Dismiss" tone="red" onClick={() => decide("rejected")}>
            <XIcon size={14} />
          </IconButton>
          {overflowItems.length > 0 && <OverflowMenu label="More actions" items={overflowItems} />}
          {!applicable && <span className="small muted">Verify manually</span>}
          {regenerating && <span className="small muted">Generating an alternative...</span>}
          {!regenerating && feedback && (
            <span className="small muted row" style={{ gap: 4 }}>
              <CheckIcon size={12} /> Noted
            </span>
          )}
          {note && (
            <span className={`small ${note.includes("Could not") ? "redline__note--err" : "muted"}`}>
              {note}
            </span>
          )}
        </div>
      )}

      {/* Secondary actions share one row instead of stacking: Comment and Add to
          playbook are both low-frequency, so they sit side by side to keep the
          card compact. Each expands in place when opened. */}
      <div className="redline__secondary">
        {!editing && (
          <CommentAction
            redline={active}
            index={index}
            proposed={proposed}
            allowCounterparty={!isInsertion}
          />
        )}
        <AddToPlaybook redline={active} />
      </div>
    </div>
  );
}
