import { useMemo, useState } from "react";
import { PlusIcon } from "@/ui/icons";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { Banner, Button, Field, Spinner, LiveRegion } from "@/ui/primitives";
import { ElapsedSeconds } from "@/ui/ElapsedSeconds";
import { DistributionBar, type DistributionSegment } from "@/ui/DistributionBar";
import { FilterChips, type FilterChipOption } from "@/ui/FilterChips";
import { StatusGroup } from "@/ui/StatusGroup";
import type { GuidelineResult, GuidelineVerdict } from "@/api/guidelines";
import {
  coerceVerdict,
  verdictHeading,
  verdictTone,
  VERDICT_ORDER,
} from "./status";
import { GuidelineCard } from "./GuidelineCard";
import { DEFAULT_GUIDELINES, useGuidelineCheck, type GuidelineState } from "./useGuidelineCheck";

type ByVerdict = Record<GuidelineVerdict, GuidelineResult[]>;

function groupByVerdict(results: GuidelineResult[]): ByVerdict {
  const by: ByVerdict = { not_met: [], partial: [], met: [], unclear: [] };
  for (const r of results) by[coerceVerdict(r.verdict)].push(r);
  return by;
}

/** Editor + run + results for the custom guideline checklist mode. */
export function GuidelinesView() {
  const { state, run, reset } = useGuidelineCheck();
  const [text, setText] = useState(DEFAULT_GUIDELINES.join("\n"));
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  function start() {
    setHidden(new Set());
    void run(text.split("\n"));
  }

  // ---- Running -----------------------------------------------------------
  if (state.status === "running") {
    return (
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <Spinner />
        <LiveRegion>
          <span className="small muted">
            Checking this document against your guidelines. This can take up to a minute.
          </span>
        </LiveRegion>
        <ElapsedSeconds className="small muted" style={{ marginLeft: "auto" }} />
      </div>
    );
  }

  // ---- Error -------------------------------------------------------------
  if (state.status === "error") {
    return (
      <div className="stack">
        <Banner tone="danger">{state.error}</Banner>
        <Button variant="default" size="sm" onClick={reset}>
          Back to guidelines
        </Button>
      </div>
    );
  }

  // ---- Done --------------------------------------------------------------
  if (state.status === "done") {
    return <GuidelineResults state={state} onReset={reset} hidden={hidden} setHidden={setHidden} />;
  }

  // ---- Idle: edit the checklist and run ----------------------------------
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        List your guideline questions, one per line. Each is checked against the whole document and
        reported as met, partial, not met, or unclear, with the passage that proves it.
      </p>
      <Field label="Guidelines (one per line)">
        <AutoTextarea
          className="guidelines-editor"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          spellCheck={false}
        />
      </Field>
      <Button variant="primary" className="btn--cta" onClick={start}>
        Run guideline check
      </Button>
    </div>
  );
}

function GuidelineResults({
  state,
  onReset,
  hidden,
  setHidden,
}: {
  state: Extract<GuidelineState, { status: "done" }>;
  onReset: () => void;
  hidden: ReadonlySet<string>;
  setHidden: (s: ReadonlySet<string>) => void;
}) {
  const results = state.results;
  const byVerdict = useMemo(() => groupByVerdict(results), [results]);

  const present = VERDICT_ORDER.filter((v) => byVerdict[v].length > 0);
  const segments: DistributionSegment[] = VERDICT_ORDER.map((v) => ({
    tone: verdictTone(v),
    count: byVerdict[v].length,
    label: verdictHeading(v).toLowerCase(),
  }));
  const chips: FilterChipOption[] = present.map((v) => ({
    key: v,
    label: verdictHeading(v),
    count: byVerdict[v].length,
    tone: verdictTone(v),
  }));

  function toggle(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="small muted">
          {results.length} guideline{results.length === 1 ? "" : "s"} checked
        </span>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <PlusIcon size={13} /> New check
        </Button>
      </div>

      <div className="card compliance-score">
        <DistributionBar segments={segments} />
      </div>

      {results.length === 0 ? (
        <Banner tone="info">
          Each guideline is checked against the whole document and marked met, partial, not met, or
          unclear, with the passage that proves it. No verdicts came back this time. Make sure each
          line reads as a clear yes/no question, then run the check again.
        </Banner>
      ) : (
        <>
          {chips.length > 1 && (
            <FilterChips
              options={chips}
              active={new Set(present.filter((v) => !hidden.has(v)))}
              onToggle={toggle}
              ariaLabel="Filter by verdict"
            />
          )}
          <div className="stack" style={{ gap: 8 }}>
            {present
              .filter((v) => !hidden.has(v))
              .map((v) => (
                <StatusGroup
                  key={v}
                  tone={verdictTone(v)}
                  label={verdictHeading(v)}
                  count={byVerdict[v].length}
                  defaultOpen={v === "not_met" || v === "partial"}
                >
                  {byVerdict[v].map((r, i) => (
                    <GuidelineCard key={`${r.guideline || "g"}-${i}`} result={r} />
                  ))}
                </StatusGroup>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
