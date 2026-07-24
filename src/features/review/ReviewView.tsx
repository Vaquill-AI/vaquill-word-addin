import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViewHeader } from "@/ui/ViewHeader";
import { Banner, Button, Badge } from "@/ui/primitives";
import { readReviewSnapshot, writeReviewSnapshot } from "@/office/reviewState";
import { readDocumentFingerprint } from "@/office/document";
import type { ReviewSnapshot } from "@/lib/reviewState";
import { ReviewForm } from "./ReviewForm";
import { ReviewSummary } from "./ReviewSummary";
import { SignoffGate } from "./SignoffGate";
import { RedlineCard } from "./RedlineCard";
import { ReviewOverview } from "./ReviewOverview";
import { ReviewMemo } from "./ReviewMemo";
import { IssuesListExport } from "./IssuesListExport";
import { ReviewFlags } from "./ReviewFlags";
import { ReviewToolbar, type RedlineFilter } from "./ReviewToolbar";
import { ReviewActionBar } from "./ReviewActionBar";
import { SetupSummary } from "./SetupSummary";
import { DocumentTools } from "./DocumentTools";
import { OutlinePanel } from "./OutlinePanel";
import { SaveToVaquill } from "@/features/integration/SaveToVaquill";
import { RecordGovernance } from "@/features/governance/RecordGovernance";
import { NdaTriageView } from "@/features/nda/NdaTriageView";
import { ComplianceView } from "@/features/compliance/ComplianceView";
import { ArrowLeftIcon } from "@/ui/icons";
import { useReviewContext } from "./ReviewProvider";
import type { RunParams } from "./useReview";
import { useReviewFreshness } from "./useReviewFreshness";
import { useDecisions, redlineKey } from "./decisions";
import { CONTRACT_TYPES, JURISDICTIONS, USER_SIDES, labelOf } from "./constants";
import { severityOf } from "@/lib/severity";
import "./review.css";

const SIGNOFF_LABEL: Record<string, string> = {
  manager: "Manager sign-off",
  partner: "Partner sign-off",
  gc: "GC sign-off",
};

function StreamingState({ label }: { label: string }) {
  // A ticking elapsed counter so a long review visibly reads as "working"
  // rather than a frozen shimmer, even between backend progress frames.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="streaming">
      <div className="row" role="status" aria-live="polite" style={{ gap: 8 }}>
        <span className="streaming__pulse" aria-hidden />
        <span className="small" style={{ fontWeight: 600 }}>
          {label}
        </span>
        <span className="small muted" style={{ marginLeft: "auto" }} aria-hidden>
          {elapsed}s
        </span>
      </div>
      <div className="streaming__skeleton">
        <span />
        <span />
        <span />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Reviewing the contract clause by clause. This usually takes 30-60 seconds. You can switch
        tabs while it runs.
      </p>
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

/** Which section of a completed review is showing. Redlines is the default so the
 *  user lands on the edits, not a wall of summary text. */
type ResultsTab = "redlines" | "summary" | "flags";

/** Lightweight underline-tab row for a finished review, so Summary, Flags, and the
 *  redline cards are separate views instead of one long scroll. Kept visually
 *  lighter than the boxed sub-tab bar above it to avoid three heavy tab rows. */
function ResultsTabs({
  value,
  onChange,
  redlineCount,
  flagCount,
}: {
  value: ResultsTab;
  onChange: (t: ResultsTab) => void;
  redlineCount: number;
  flagCount: number;
}) {
  const tabs: { id: ResultsTab; label: string; count?: number }[] = [
    { id: "redlines", label: "Redlines", count: redlineCount },
    { id: "summary", label: "Summary" },
    { id: "flags", label: "Flags", count: flagCount },
  ];
  return (
    <div className="review-restabs" role="tablist" aria-label="Review results">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={`review-restab${value === t.id ? " review-restab--on" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && t.count > 0 && (
            <span className="review-restab__count">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function ReviewView({
  pendingPlaybook,
  pendingPreset,
  pendingFocus,
  onPendingConsumed,
}: {
  /** A "Run this playbook" handoff from the Playbook tab: pre-fills the form. */
  pendingPlaybook?: { playbookId: string; contractType: string } | null;
  /** A "quick check" handoff: open the NDA-screen or compliance preset. */
  pendingPreset?: "nda" | "compliance" | null;
  /** A "View in review" handoff from the Deal cockpit: scroll to + highlight one
   *  clause's redline card (by redlineKey). */
  pendingFocus?: { clauseKey: string; clauseName?: string } | null;
  onPendingConsumed?: () => void;
} = {}) {
  const { state, run, reset, hydrate } = useReviewContext();
  const [params, setParams] = useState<RunParams | null>(null);
  const [formInit, setFormInit] = useState<{ contractType: string; playbookId: string } | null>(null);
  const [filter, setFilter] = useState<RedlineFilter>("all");
  // Which section of a completed review is showing (Redlines / Summary / Flags).
  const [resultsTab, setResultsTab] = useState<ResultsTab>("redlines");
  // Quick-check presets: an NDA screen and a compliance check are review flavors,
  // so they live here rather than as separate tools. When set, the preset view
  // takes over; the full review's state is preserved underneath.
  const [preset, setPreset] = useState<null | "nda" | "compliance">(null);
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [dismissedResume, setDismissedResume] = useState(false);
  const [resumeChanged, setResumeChanged] = useState(false);
  // The draft id SaveToVaquill yields once the reviewed contract is saved.
  // When present, the governance sign-off runs through the backend's
  // authority-enforced approval instead of the in-file attestation.
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  // The redline card the Deal cockpit asked us to focus. While set, that card
  // gets a highlight ring and is scrolled into view; it clears itself shortly
  // after so the ring is a brief cue, not a permanent state.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const focusCardRef = useRef<HTMLDivElement>(null);

  const result = state.status === "done" ? state.result : null;

  // Best-effort watch: has the document changed since this review ran?
  const { stale: docChanged } = useReviewFreshness(state.docHash);

  // Load any review stored in the document (survives close/reopen/email).
  useEffect(() => {
    let alive = true;
    readReviewSnapshot()
      .then((s) => alive && setSnapshot(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // "Run this playbook" handoff from the Playbook tab: reset to a fresh form
  // pre-filled with the playbook's contract type + selection, then clear the
  // pending signal. The guard on `pendingPlaybook` makes re-runs a no-op once
  // consumed (the parent sets it back to null).
  useEffect(() => {
    if (!pendingPlaybook) return;
    setFormInit(pendingPlaybook);
    reset();
    onPendingConsumed?.();
  }, [pendingPlaybook, reset, onPendingConsumed]);

  // A "quick check" handoff opens the NDA / compliance preset.
  useEffect(() => {
    if (!pendingPreset) return;
    setPreset(pendingPreset);
    onPendingConsumed?.();
  }, [pendingPreset, onPendingConsumed]);

  // A "View in review" handoff from the cockpit: remember which clause to focus,
  // widen the filter so the card can't be hidden, and consume the intent. The
  // hydrate + scroll happen in the two effects below once the redlines exist.
  useEffect(() => {
    if (!pendingFocus) return;
    setFocusKey(pendingFocus.clauseKey);
    setFilter("all");
    setResultsTab("redlines"); // the focused card lives on the Redlines tab
    onPendingConsumed?.();
  }, [pendingFocus, onPendingConsumed]);

  // Persist a freshly completed review into the .docx (skip when resuming).
  useEffect(() => {
    if (!result) return;
    if (snapshot && result.id === snapshot.result.id) return;
    const snap: ReviewSnapshot = {
      savedAt: new Date().toISOString(),
      result,
      docHash: state.docHash ?? undefined,
    };
    void writeReviewSnapshot(snap).catch(() => {});
    setSnapshot(snap);
  }, [result, snapshot, state.docHash]);

  // When a stored review loads, check whether the document has since changed so
  // the resume prompt can warn that the saved review may be out of date.
  useEffect(() => {
    if (!snapshot?.docHash) {
      setResumeChanged(false);
      return;
    }
    let alive = true;
    readDocumentFingerprint()
      .then((h) => alive && setResumeChanged(h !== snapshot.docHash))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [snapshot]);
  // Persist accept/reject decisions into the .docx snapshot (stable-id keyed) so
  // reopening the file restores review progress.
  const persistDecisions = useCallback(
    (byId: Record<string, "pending" | "accepted" | "rejected">) => {
      if (!result) return;
      const currentResult = result;
      setSnapshot((prev) => {
        const base: ReviewSnapshot =
          prev && prev.result.id === currentResult.id
            ? prev
            : {
                savedAt: new Date().toISOString(),
                result: currentResult,
                docHash: state.docHash ?? undefined,
              };
        const next: ReviewSnapshot = { ...base, decisions: byId };
        void writeReviewSnapshot(next).catch(() => {});
        return next;
      });
    },
    [result, state.docHash],
  );
  const { decisionOf, decisionOfLive, setDecision, addressed } = useDecisions(
    result?.redlines ?? [],
    result?.id,
    snapshot?.decisions,
    persistDecisions,
  );
  const busy = state.status === "reading" || state.status === "streaming";
  // Shared apply lock so a per-card Accept and "Apply all" can never run at the
  // same time. Without it an insertion-type redline can be applied twice (the
  // clause gets appended to the document end twice, with no idempotency key).
  const [applyBusy, setApplyBusy] = useState(false);

  // The progress card renders below the form and was easy to miss. When a run
  // starts, bring it into view so the user immediately sees it working.
  const streamingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (busy) {
      streamingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [busy]);

  const redlines = result?.redlines ?? [];
  const counts = useMemo(
    () => ({
      all: redlines.length,
      high: redlines.filter((r) => severityOf(r) === "high").length,
      unresolved: redlines.filter((_, i) => decisionOf(i) === "pending").length,
    }),
    [redlines, decisionOf],
  );

  const visible = useMemo(
    () =>
      redlines
        .map((r, i) => ({ r, i }))
        .filter(({ r, i }) => {
          if (filter === "high") return severityOf(r) === "high";
          if (filter === "unresolved") return decisionOf(i) === "pending";
          return true;
        }),
    [redlines, filter, decisionOf],
  );

  // Focus flow, step 1: if a clause was requested but no live review is showing,
  // hydrate the one stored in the document so its cards render. Without this the
  // idle "Resume review" prompt would sit in the way of the deep-link.
  useEffect(() => {
    if (!focusKey || result || !snapshot) return;
    hydrate(snapshot.result, snapshot.docHash);
  }, [focusKey, result, snapshot, hydrate]);

  // Focus flow, step 2: once the redlines are on screen, scroll the requested
  // card into view and let its highlight ring play, then clear the key so the
  // ring is a one-shot cue. The clear is armed even if the card is missing (a
  // stale key from an out-of-date snapshot) so focusKey never lingers.
  useEffect(() => {
    if (!focusKey || !result) return;
    focusCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFocusKey(null), 2600);
    return () => clearTimeout(t);
  }, [focusKey, result, visible]);

  function onRun(p: RunParams) {
    setParams(p);
    setFilter("all");
    setResultsTab("redlines"); // land on the edits when a fresh review completes
    void run(p);
  }

  if (preset) {
    return (
      <div className="stack review">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPreset(null)}
          style={{ alignSelf: "flex-start" }}
          aria-label="Back to Review"
        >
          <ArrowLeftIcon size={14} /> Review
        </Button>
        {preset === "nda" ? <NdaTriageView /> : <ComplianceView />}
      </div>
    );
  }

  if (result) {
    const gate = result.approvalGate;
    const summaryParts = params
      ? [
          labelOf(CONTRACT_TYPES, params.contractType),
          labelOf(USER_SIDES, params.userSide),
          labelOf(JURISDICTIONS, params.jurisdiction),
        ]
      : [];

    const flagCount = result.flags?.length ?? 0;

    return (
      <div className="review review--results">
        <div className="review__header">
          <SetupSummary parts={summaryParts} onNew={reset} />
          <ResultsTabs
            value={resultsTab}
            onChange={setResultsTab}
            redlineCount={redlines.length}
            flagCount={flagCount}
          />
        </div>

        <div className="review__body">
          {/* Warnings apply to the whole review, so they stay above the tab body. */}
          {state.partial && params && (
            <Banner tone="warn">
              <p className="small" style={{ margin: 0 }}>
                Reviewed {state.partial.done} of {state.partial.total} sections. The rest could not be
                completed (usually a quota or network limit). The findings below cover the completed
                sections only.
              </p>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <Button variant="primary" size="sm" onClick={() => onRun(params)}>
                  Try the full review again
                </Button>
              </div>
            </Banner>
          )}
          {docChanged && params && (
            <Banner tone="warn">
              <p className="small" style={{ margin: 0 }}>
                This document changed after the review ran, so it may be out of date. Applying still
                re-checks each clause against the live document.
              </p>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <Button variant="primary" size="sm" onClick={() => onRun(params)}>
                  Re-run review
                </Button>
              </div>
            </Banner>
          )}

          {/* SUMMARY tab: the read-the-review content + review-level utilities. */}
          {resultsTab === "summary" && (
            <div className="stack">
              {gate && (
                <SignoffGate
                  gate={gate}
                  action={
                    <RecordGovernance
                      gate={gate}
                      meta={{
                        contractType: result.contractType ?? params?.contractType,
                        playbookId: params?.playbookId,
                        matterId: params?.matterId,
                        draftId: savedDraftId ?? undefined,
                      }}
                    />
                  }
                />
              )}
              <ReviewSummary result={result} />
              <ReviewOverview redlines={redlines} />
              <ReviewMemo result={result} redlines={redlines} />
              <IssuesListExport
                redlines={redlines}
                flags={result.flags ?? []}
                decisionOf={decisionOf}
              />
              <OutlinePanel />
              {redlines.length > 0 && <DocumentTools redlines={redlines} />}
              <SaveToVaquill
                mode="review"
                redlines={redlines}
                defaultMatterId={params?.matterId}
                contractType={result.contractType ?? params?.contractType}
                title={
                  params
                    ? `${labelOf(CONTRACT_TYPES, params.contractType)} (reviewed)`
                    : "Reviewed contract"
                }
                onSaved={setSavedDraftId}
              />
            </div>
          )}

          {/* FLAGS tab. */}
          {resultsTab === "flags" &&
            (flagCount > 0 ? (
              <ReviewFlags flags={result.flags ?? []} />
            ) : (
              <Banner tone="info">No items flagged for discussion.</Banner>
            ))}

          {/* REDLINES tab: the filter toolbar + the edit cards. */}
          {resultsTab === "redlines" && (
            <div className="stack">
              <ReviewToolbar
                total={redlines.length}
                addressed={addressed}
                filter={filter}
                onFilter={setFilter}
                counts={counts}
                signoff={
                  gate?.required ? (
                    <Badge tone="red">
                      {gate.level ? SIGNOFF_LABEL[gate.level] : "Sign-off required"}
                    </Badge>
                  ) : undefined
                }
              />
              {redlines.length === 0 ? (
                <Banner tone="info">
                  No redlines suggested. This contract looks clean from your side.
                </Banner>
              ) : visible.length === 0 ? (
                <p className="small muted" style={{ textAlign: "center", padding: "12px 0" }}>
                  {filter === "unresolved"
                    ? "Everything here is addressed."
                    : "Nothing matches this filter."}
                </p>
              ) : (
                <div className="stack">
                  {visible.map(({ r, i }) => {
                    const focused = redlineKey(r) === focusKey;
                    return (
                      <div
                        key={`${r.clauseName}-${i}`}
                        ref={focused ? focusCardRef : undefined}
                        className={focused ? "redline-focus" : undefined}
                      >
                        <RedlineCard
                          redline={r}
                          index={i}
                          decision={decisionOf(i)}
                          onDecision={setDecision}
                          applyBusy={applyBusy}
                          setApplyBusy={setApplyBusy}
                          fixContext={
                            params
                              ? {
                                  userSide: params.userSide,
                                  paperSide: params.paperSide,
                                  playbookId: params.playbookId,
                                }
                              : undefined
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Apply-all is a redlines action, so it pins to the bottom only there. */}
        {redlines.length > 0 && resultsTab === "redlines" && (
          <ReviewActionBar
            redlines={redlines}
            contractType={result.contractType ?? params?.contractType ?? "other"}
            decisionOf={decisionOf}
            decisionOfLive={decisionOfLive}
            setDecision={setDecision}
            applyBusy={applyBusy}
            setApplyBusy={setApplyBusy}
          />
        )}
      </div>
    );
  }

  return (
    <div className="stack review">
      <ViewHeader
        title="Review this contract"
        info="Vaquill AI suggests grounded edits from your side and applies them as native tracked changes. A green Verified badge means we found the exact clause in your document, so it is safe to auto-apply; amber means verify it yourself. The sign-off gate flags when a deal needs manager, partner, or GC approval before you send."
        subtitle="Grounded redlines from your side, applied as native tracked changes."
      />

      {state.status === "idle" && snapshot && !dismissedResume && (
        <Banner tone={resumeChanged ? "warn" : "info"}>
          <p className="small" style={{ margin: 0 }}>
            This document was reviewed {fmtDate(snapshot.savedAt)} - {snapshot.result.redlines.length}{" "}
            redline{snapshot.result.redlines.length === 1 ? "" : "s"}.{" "}
            {resumeChanged
              ? "The document has changed since then, so the saved review may be out of date."
              : "The review is stored in the file."}
          </p>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => hydrate(snapshot.result, snapshot.docHash)}
            >
              Resume review
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDismissedResume(true)}>
              Start fresh
            </Button>
          </div>
        </Banner>
      )}

      <ReviewForm
        key={formInit?.playbookId ?? "blank"}
        onRun={onRun}
        busy={busy}
        initial={formInit ?? undefined}
      />

      {!busy && (
        <div className="review-presets stack" style={{ gap: 6 }}>
          <span className="small muted">Or run a quick check instead of a full review</span>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Button variant="default" size="sm" onClick={() => setPreset("nda")}>
              NDA quick-screen
            </Button>
            <Button variant="default" size="sm" onClick={() => setPreset("compliance")}>
              Compliance check
            </Button>
          </div>
        </div>
      )}

      {busy && (
        <div className="stack" style={{ gap: 8 }} ref={streamingRef}>
          <StreamingState
            label={
              state.status === "reading"
                ? "Reading the document..."
                : state.progress?.label ?? "Reviewing clauses..."
            }
          />
          <Button variant="ghost" size="sm" onClick={reset}>
            Cancel
          </Button>
        </div>
      )}

      {state.status === "error" && state.error && (
        <div className="stack" style={{ gap: 8 }}>
          <Banner tone="danger">{state.error}</Banner>
          {params && (
            <Button variant="ghost" size="sm" onClick={() => onRun(params)}>
              Try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
