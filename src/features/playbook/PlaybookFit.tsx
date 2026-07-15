import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Spinner, LiveRegion } from "@/ui/primitives";
import { ViewHeader } from "@/ui/ViewHeader";
import { useAppNav } from "@/app/nav";
import { ElapsedSeconds } from "@/ui/ElapsedSeconds";
import { ArrowLeftIcon } from "@/ui/icons";
import { DistributionBar, type DistributionSegment } from "@/ui/DistributionBar";
import { FilterChips, type FilterChipOption } from "@/ui/FilterChips";
import { StatusGroup } from "@/ui/StatusGroup";
import { readStructuredDocumentText } from "@/office/document";
import { errorMessage } from "@/api/errors";
import {
  checkPlaybookFit,
  type PlaybookFitResult,
  type PlaybookFitVerdict,
} from "@/api/playbook-fit";
import type { PlaybookDetail } from "@/api/playbooks";
import {
  coerceFitVerdict,
  FIT_VERDICT_ORDER,
  fitVerdictHeading,
  fitVerdictTone,
} from "./status";
import { PlaybookFitCard } from "./PlaybookFitCard";
import "./playbook-fit.css";

/** Backend requires a non-trivial contract; guard before the network call. */
const MIN_CHARS = 100;

type FitState =
  | { status: "running" }
  | { status: "done"; results: PlaybookFitResult[] }
  | { status: "error"; error: string };

type ByVerdict = Record<PlaybookFitVerdict, PlaybookFitResult[]>;

function groupByVerdict(results: PlaybookFitResult[]): ByVerdict {
  const by: ByVerdict = {
    below_floor: [],
    meets_fallback: [],
    not_addressed: [],
    meets_standard: [],
  };
  for (const r of results) by[coerceFitVerdict(r.verdict)].push(r);
  return by;
}

/**
 * Runs a playbook fit report against the open contract and renders the results as
 * status-grouped buckets. Each clause card keeps the clause's fallback ladder
 * visible with the contract's matched rung highlighted. Auto-runs when opened;
 * `onBack` returns to the playbook detail.
 */
export function PlaybookFit({
  playbook,
  onBack,
}: {
  playbook: PlaybookDetail;
  onBack: () => void;
}) {
  const [state, setState] = useState<FitState>({ status: "running" });
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setHidden(new Set());
    setState({ status: "running" });
    try {
      const text = await readStructuredDocumentText();
      if (text.trim().length < MIN_CHARS) {
        setState({
          status: "error",
          error: "This document is too short to check. Add the contract text first.",
        });
        return;
      }
      const results = await checkPlaybookFit(text, playbook.positions, controller.signal);
      if (!controller.signal.aborted) setState({ status: "done", results });
    } catch (e) {
      if (controller.signal.aborted) return;
      setState({
        status: "error",
        error: errorMessage(e),
      });
    }
  }, [playbook.positions]);

  useEffect(() => {
    void run();
    return () => abortRef.current?.abort();
  }, [run]);

  // ---- Running -----------------------------------------------------------
  if (state.status === "running") {
    return (
      <div className="stack playbook-view">
        <BackRow onBack={onBack} name={playbook.name} />
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner />
          <LiveRegion>
            <span className="small muted">
              Checking this contract against your playbook. This can take up to a minute.
            </span>
          </LiveRegion>
          <ElapsedSeconds className="small muted" style={{ marginLeft: "auto" }} />
        </div>
      </div>
    );
  }

  // ---- Error -------------------------------------------------------------
  if (state.status === "error") {
    return (
      <div className="stack playbook-view">
        <BackRow onBack={onBack} name={playbook.name} />
        <Banner tone="danger">{state.error}</Banner>
        <Button variant="default" size="sm" onClick={() => void run()}>
          Try again
        </Button>
      </div>
    );
  }

  // ---- Done --------------------------------------------------------------
  return (
    <FitResults
      playbook={playbook}
      results={state.results}
      onBack={onBack}
      onRerun={() => void run()}
      hidden={hidden}
      setHidden={setHidden}
    />
  );
}

function BackRow({ onBack, name }: { onBack: () => void; name: string }) {
  return (
    <div className="row" style={{ gap: 8, alignItems: "center", justifyContent: "space-between" }}>
      <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to playbook">
        <ArrowLeftIcon size={14} /> {name}
      </Button>
    </div>
  );
}

function FitResults({
  playbook,
  results,
  onBack,
  onRerun,
  hidden,
  setHidden,
}: {
  playbook: PlaybookDetail;
  results: PlaybookFitResult[];
  onBack: () => void;
  onRerun: () => void;
  hidden: ReadonlySet<string>;
  setHidden: (s: ReadonlySet<string>) => void;
}) {
  const { navigate } = useAppNav();
  const byVerdict = useMemo(() => groupByVerdict(results), [results]);

  const present = FIT_VERDICT_ORDER.filter((v) => byVerdict[v].length > 0);
  const segments: DistributionSegment[] = FIT_VERDICT_ORDER.map((v) => ({
    tone: fitVerdictTone(v),
    count: byVerdict[v].length,
    label: fitVerdictHeading(v).toLowerCase(),
  }));
  const chips: FilterChipOption[] = present.map((v) => ({
    key: v,
    label: fitVerdictHeading(v),
    count: byVerdict[v].length,
    tone: fitVerdictTone(v),
  }));

  function toggle(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
  }

  return (
    <div className="stack playbook-view">
      <BackRow onBack={onBack} name={playbook.name} />

      <ViewHeader
        title="Playbook fit"
        subtitle={
          <>
            {results.length} clause{results.length === 1 ? "" : "s"} checked against {playbook.name}.
            Each card shows where the contract sits on that clause's fallback ladder. Guidance, not
            legal advice.
          </>
        }
      />

      <div className="row" style={{ justifyContent: "space-between" }}>
        {/* Fit-check -> full review loop: run the governed contract review with
            this same playbook (redlines, sign-off gate, corrected export). */}
        <Button
          variant="default"
          size="sm"
          onClick={() =>
            navigate("review", {
              kind: "runPlaybook",
              playbookId: playbook.id,
              contractType: playbook.contractType,
            })
          }
        >
          Run full review
        </Button>
        <Button variant="ghost" size="sm" onClick={onRerun}>
          Re-run
        </Button>
      </div>

      <div className="card compliance-score">
        <DistributionBar segments={segments} />
      </div>

      {results.length === 0 ? (
        <Banner tone="info">
          No results were returned. Try again, or open a playbook with clause positions.
        </Banner>
      ) : (
        <>
          {chips.length > 1 && (
            <FilterChips
              options={chips}
              active={new Set(present.filter((v) => !hidden.has(v)))}
              onToggle={toggle}
              ariaLabel="Filter by fit"
            />
          )}
          <div className="stack" style={{ gap: 8 }}>
            {present
              .filter((v) => !hidden.has(v))
              .map((v) => (
                <StatusGroup
                  key={v}
                  tone={fitVerdictTone(v)}
                  label={fitVerdictHeading(v)}
                  count={byVerdict[v].length}
                  defaultOpen={v === "below_floor" || v === "meets_fallback"}
                >
                  {byVerdict[v].map((r, i) => (
                    <PlaybookFitCard
                      key={`${r.clauseType || "c"}-${i}`}
                      result={r}
                      position={playbook.positions[r.clauseType]}
                    />
                  ))}
                </StatusGroup>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
