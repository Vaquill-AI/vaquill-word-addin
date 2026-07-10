import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Badge } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { readReviewSnapshot, writeReviewSnapshot } from "@/office/reviewState";
import type { ReviewSnapshot } from "@/lib/reviewState";
import { ReviewForm } from "./ReviewForm";
import { ReviewSummary } from "./ReviewSummary";
import { SignoffGate } from "./SignoffGate";
import { RedlineCard } from "./RedlineCard";
import { ReviewToolbar, type RedlineFilter } from "./ReviewToolbar";
import { ReviewActionBar } from "./ReviewActionBar";
import { SetupSummary } from "./SetupSummary";
import { RecordGovernance } from "@/features/governance/RecordGovernance";
import { useReview, type RunParams } from "./useReview";
import { useDecisions } from "./decisions";
import { CONTRACT_TYPES, USER_SIDES, labelOf } from "./constants";
import { severityOf } from "@/lib/severity";
import "./review.css";

const SIGNOFF_LABEL: Record<string, string> = {
  manager: "Manager sign-off",
  partner: "Partner sign-off",
  gc: "GC sign-off",
};

function StreamingState({ label }: { label: string }) {
  return (
    <div className="streaming">
      <div className="row" role="status" aria-live="polite" style={{ gap: 8 }}>
        <span className="streaming__pulse" aria-hidden />
        <span className="small" style={{ fontWeight: 600 }}>
          {label}
        </span>
      </div>
      <div className="streaming__skeleton">
        <span />
        <span />
        <span />
      </div>
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

export function ReviewView() {
  const { state, run, reset, hydrate } = useReview();
  const [params, setParams] = useState<RunParams | null>(null);
  const [filter, setFilter] = useState<RedlineFilter>("all");
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [dismissedResume, setDismissedResume] = useState(false);

  const result = state.status === "done" ? state.result : null;

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

  // Persist a freshly completed review into the .docx (skip when resuming).
  useEffect(() => {
    if (!result) return;
    if (snapshot && result.id === snapshot.result.id) return;
    const snap: ReviewSnapshot = { savedAt: new Date().toISOString(), result };
    void writeReviewSnapshot(snap).catch(() => {});
    setSnapshot(snap);
  }, [result, snapshot]);
  const { decisionOf, setDecision, addressed } = useDecisions(result?.id);
  const busy = state.status === "reading" || state.status === "streaming";

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

  function onRun(p: RunParams) {
    setParams(p);
    setFilter("all");
    void run(p);
  }

  if (result) {
    const gate = result.approvalGate;
    const summaryParts = params
      ? [
          labelOf(CONTRACT_TYPES, params.contractType),
          labelOf(USER_SIDES, params.userSide),
          params.jurisdiction,
        ]
      : [];

    return (
      <div className="review review--results">
        <div className="review__header">
          <SetupSummary parts={summaryParts} onNew={reset} />
          {gate?.required && (
            <div className="signoff-pill">
              <Badge tone="red">{gate.level ? SIGNOFF_LABEL[gate.level] : "Sign-off required"}</Badge>
            </div>
          )}
          <ReviewToolbar
            total={redlines.length}
            addressed={addressed}
            filter={filter}
            onFilter={setFilter}
            counts={counts}
          />
        </div>

        <div className="review__body">
          {gate && <SignoffGate gate={gate} />}
          {gate && (
            <RecordGovernance
              gate={gate}
              meta={{ contractType: result.contractType ?? params?.contractType, playbookId: params?.playbookId }}
            />
          )}
          <ReviewSummary result={result} />

          {redlines.length === 0 ? (
            <Banner tone="info">No redlines suggested. This contract looks clean from your side.</Banner>
          ) : visible.length === 0 ? (
            <p className="small muted" style={{ textAlign: "center", padding: "12px 0" }}>
              {filter === "unresolved" ? "Everything here is addressed." : "Nothing matches this filter."}
            </p>
          ) : (
            <div className="stack">
              {visible.map(({ r, i }) => (
                <RedlineCard
                  key={`${r.clauseName}-${i}`}
                  redline={r}
                  index={i}
                  decision={decisionOf(i)}
                  onDecision={setDecision}
                />
              ))}
            </div>
          )}
        </div>

        {redlines.length > 0 && (
          <ReviewActionBar
            redlines={redlines}
            contractType={result.contractType ?? params?.contractType ?? "other"}
            decisionOf={decisionOf}
            setDecision={setDecision}
          />
        )}
      </div>
    );
  }

  return (
    <div className="stack review">
      <div className="stack" style={{ gap: 4 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 className="view-title">Review this contract</h1>
          <InfoTip text="Vaquill AI suggests grounded edits from your side and applies them as native tracked changes. A green Verified badge means we found the exact clause in your document, so it is safe to auto-apply; amber means verify it yourself. The sign-off gate flags when a deal needs manager, partner, or GC approval before you send." />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Grounded redlines from your side, applied as native tracked changes.
        </p>
      </div>

      {state.status === "idle" && snapshot && !dismissedResume && (
        <Banner tone="info">
          <p className="small" style={{ margin: 0 }}>
            This document was reviewed {fmtDate(snapshot.savedAt)} - {snapshot.result.redlines.length}{" "}
            redline{snapshot.result.redlines.length === 1 ? "" : "s"}. The review is stored in the file.
          </p>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <Button variant="primary" size="sm" onClick={() => hydrate(snapshot.result)}>
              Resume review
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDismissedResume(true)}>
              Start fresh
            </Button>
          </div>
        </Banner>
      )}

      <ReviewForm onRun={onRun} busy={busy} />

      {busy && (
        <StreamingState
          label={
            state.status === "reading"
              ? "Reading the document..."
              : state.progress?.label ?? "Reviewing clauses..."
          }
        />
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
