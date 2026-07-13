import { useEffect, useMemo, useState } from "react";
import { Badge, Banner, Button, Field, Spinner, LiveRegion, SegmentedControl } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { ElapsedSeconds } from "@/ui/ElapsedSeconds";
import { DistributionBar, type DistributionSegment } from "@/ui/DistributionBar";
import { FilterChips, type FilterChipOption } from "@/ui/FilterChips";
import { StatusGroup } from "@/ui/StatusGroup";
import type { ComplianceRequirement, ComplianceStatusValue } from "@/api/clause-tools";
import { REGULATIONS, regulationLabel, suggestRegulation } from "./regulations";
import { readDocumentText } from "@/office/document";
import { coerceStatus, scoreTone, statusHeading, statusTone, STATUS_ORDER } from "./status";
import { RequirementCard } from "./RequirementCard";
import { useCompliance, type ComplianceState } from "./useCompliance";
import { GuidelinesView } from "./GuidelinesView";
import "./compliance.css";

type ByStatus = Record<ComplianceStatusValue, ComplianceRequirement[]>;

function groupByStatus(reqs: ComplianceRequirement[]): ByStatus {
  const by: ByStatus = {
    non_compliant: [],
    partially_compliant: [],
    compliant: [],
    not_applicable: [],
  };
  for (const r of reqs) by[coerceStatus(r.status)].push(r);
  return by;
}

type Mode = "regulation" | "guidelines";

const MODE_OPTIONS = [
  { value: "regulation" as const, label: "Regulation" },
  { value: "guidelines" as const, label: "Guidelines" },
];

const MODE_INFO: Record<Mode, string> = {
  regulation:
    "Checks the whole document against a regulation's requirements and reports each as compliant, partial, a gap, or not applicable, with what was found and how to fix it. Guidance, not legal advice: confirm findings before you rely on them.",
  guidelines:
    "Checks the whole document against your own plain-English guideline questions. Each returns a verdict (met, partial, not met, unclear) plus the passage from the document that proves it. Guidance, not legal advice: confirm findings before you rely on them.",
};

/**
 * Compliance pane with two modes: a fixed-regulation checklist (the original
 * flow) and a custom guideline checklist. The mode toggle lives at the top; the
 * title and InfoTip are shared, and each mode owns its own body/state.
 */
export function ComplianceView() {
  const [mode, setMode] = useState<Mode>("regulation");

  return (
    <div className="stack compliance-view">
      <div className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 className="view-title">Compliance</h1>
          <InfoTip text={MODE_INFO[mode]} />
        </div>
        <SegmentedControl
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
          label="Compliance mode"
        />
      </div>

      {mode === "regulation" ? <RegulationMode /> : <GuidelinesView />}
    </div>
  );
}

/**
 * The original fixed-regulation checklist: pick a regulation, run a whole-document
 * check, and browse per-requirement results grouped by status. Unchanged in
 * behavior; the surrounding shell now owns the title, InfoTip, and mode toggle.
 */
function RegulationMode() {
  const { state, run, reset } = useCompliance();
  const [regulation, setRegulation] = useState(REGULATIONS[0]?.value ?? "ccpa");
  // Statuses the user has hidden via the filter chips (empty = show all).
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  // Zero-config: detect the relevant regulation from the document and collapse
  // the picker under "Adjust" so the default is one click.
  const [showPicker, setShowPicker] = useState(false);
  const [detected, setDetected] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const text = await readDocumentText();
        if (!alive) return;
        const guess = suggestRegulation(text);
        if (guess) {
          setRegulation(guess);
          setDetected(guess);
        }
      } catch {
        // Best-effort; keep the default regulation.
      } finally {
        if (alive) setDetecting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function start() {
    setHidden(new Set());
    void run(regulation);
  }

  // ---- Idle: confirm the (detected) regulation and run -------------------
  if (state.status === "idle") {
    const blurb = REGULATIONS.find((r) => r.value === regulation)?.blurb;
    return (
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Check this document against a regulation and see every requirement met, partially met,
          or missing.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "9px 11px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--fill-subtle)",
          }}
        >
          {detecting ? (
            <span className="row small muted" style={{ gap: 8, alignItems: "center" }}>
              <Spinner /> Detecting the relevant regulation...
            </span>
          ) : (
            <span className="small">
              Checking against <strong>{regulationLabel(regulation)}</strong>
              {detected === regulation && (
                <span className="muted" style={{ marginLeft: 6, fontStyle: "italic" }}>
                  (detected)
                </span>
              )}
            </span>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowPicker((v) => !v)}>
            {showPicker ? "Done" : "Adjust"}
          </Button>
        </div>

        {showPicker && (
          <Field label="Regulation">
            <select
              value={regulation}
              onChange={(e) => {
                setRegulation(e.target.value);
                setDetected(null);
              }}
            >
              {REGULATIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {blurb && <p className="small muted" style={{ margin: 0 }}>{blurb}</p>}

        <Button variant="primary" className="btn--cta" onClick={start}>
          Check compliance
        </Button>
      </div>
    );
  }

  // ---- Running -----------------------------------------------------------
  if (state.status === "running") {
    return (
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <Spinner />
        <LiveRegion>
          <span className="small muted">
            Checking this document against {regulationLabel(state.regulation)}. This can take up to
            a minute.
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
          Try again
        </Button>
      </div>
    );
  }

  // ---- Done --------------------------------------------------------------
  return <ComplianceResults state={state} onReset={reset} hidden={hidden} setHidden={setHidden} />;
}

function ComplianceResults({
  state,
  onReset,
  hidden,
  setHidden,
}: {
  state: Extract<ComplianceState, { status: "done" }>;
  onReset: () => void;
  hidden: ReadonlySet<string>;
  setHidden: (s: ReadonlySet<string>) => void;
}) {
  const { result, regulation } = state;
  const reqs = result.requirements ?? [];
  const byStatus = useMemo(() => groupByStatus(reqs), [reqs]);

  const present = STATUS_ORDER.filter((s) => byStatus[s].length > 0);
  const segments: DistributionSegment[] = STATUS_ORDER.map((s) => ({
    tone: statusTone(s),
    count: byStatus[s].length,
    label: statusHeading(s).toLowerCase(),
  }));
  const chips: FilterChipOption[] = present.map((s) => ({
    key: s,
    label: statusHeading(s),
    count: byStatus[s].length,
    tone: statusTone(s),
  }));

  function toggle(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
  }

  const score = typeof result.complianceScore === "number" ? Math.round(result.complianceScore) : null;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="small muted">{regulationLabel(regulation)}</span>
        <Button variant="ghost" size="sm" onClick={onReset}>
          New check
        </Button>
      </div>

      <div className="card compliance-score">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="small muted">{regulationLabel(regulation)}</span>
          {score !== null && (
            <Badge tone={scoreTone(score)}>{score}% compliant</Badge>
          )}
        </div>
        <DistributionBar segments={segments} />
        {result.summary && <p className="small" style={{ margin: 0 }}>{result.summary}</p>}
      </div>

      {result.parseWarning && <Banner tone="warn">{result.parseWarning}</Banner>}

      {reqs.length === 0 ? (
        <Banner tone="info">
          Compliance tests this document against a regulation and marks each requirement met,
          partial, a gap, or not applicable. No requirements came back for{" "}
          {regulationLabel(regulation)} this time. Try again, or choose a different regulation.
        </Banner>
      ) : (
        <>
          {chips.length > 1 && (
            <FilterChips
              options={chips}
              active={new Set(present.filter((s) => !hidden.has(s)))}
              onToggle={toggle}
              ariaLabel="Filter by status"
            />
          )}
          <div className="stack" style={{ gap: 8 }}>
            {present
              .filter((s) => !hidden.has(s))
              .map((s) => (
                <StatusGroup
                  key={s}
                  tone={statusTone(s)}
                  label={statusHeading(s)}
                  count={byStatus[s].length}
                  defaultOpen={s === "non_compliant" || s === "partially_compliant"}
                >
                  {byStatus[s].map((req, i) => (
                    <RequirementCard key={`${req.requirementId ?? req.requirementName ?? "req"}-${i}`} req={req} />
                  ))}
                </StatusGroup>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
