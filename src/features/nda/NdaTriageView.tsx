import { useState } from "react";
import { Badge, Banner, Button, Field, Spinner, LiveRegion } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { ElapsedSeconds } from "@/ui/ElapsedSeconds";
import { DistributionBar, type DistributionSegment } from "@/ui/DistributionBar";
import type { StatusTone } from "@/ui/status";
import { useNdaTriage } from "./useNdaTriage";
import type {
  CriterionStatus,
  NdaClassification,
  NdaTriageResult,
  NdaType,
  ScreeningCriterion,
} from "@/api/nda-triage";
import "./nda.css";

const CLASSIFICATION_TONE: Record<NdaClassification, StatusTone> = {
  green: "green",
  yellow: "yellow",
  red: "red",
};

const CLASSIFICATION_LABEL: Record<NdaClassification, string> = {
  green: "Green - standard",
  yellow: "Yellow - review",
  red: "Red - escalate",
};

const STATUS_TONE: Record<CriterionStatus, StatusTone> = {
  pass: "green",
  warn: "yellow",
  fail: "red",
  not_found: "neutral",
};

const STATUS_LABEL: Record<CriterionStatus, string> = {
  pass: "Pass",
  warn: "Warn",
  fail: "Fail",
  not_found: "Not found",
};

const NDA_TYPE_LABEL: Record<NdaType, string> = {
  mutual: "Mutual",
  unilateral_disclosing: "One-way (we disclose)",
  unilateral_receiving: "One-way (we receive)",
  unknown: "Structure unclear",
};

/**
 * NDA triage: a fast 10-criteria screen of the open NDA that answers "can I sign
 * this in seconds, or does it need counsel?". Reads the whole document, screens
 * it server-side against standard NDA positions, and shows a GREEN/YELLOW/RED
 * verdict plus a per-criterion checklist. Distinct from the full contract review
 * (redlines) and from the counterparty-changes triage (Review > Changes).
 */
export function NdaTriageView() {
  const { state, run, reset } = useNdaTriage();
  const [counterparty, setCounterparty] = useState("");
  const [context, setContext] = useState("");

  const header = (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 className="view-title">NDA triage</h1>
        <InfoTip text="Screens the open NDA against 10 standard criteria and classifies it Green, Yellow, or Red so you can decide fast whether to sign, negotiate, or escalate. A first-pass screen, not a full review: run Review for redlines and get sign-off before signing." />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Screen this NDA against standard positions and get a Green / Yellow / Red call.
      </p>
    </div>
  );

  if (state.status === "running") {
    return (
      <div className="stack nda-view">
        {header}
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner />
          <LiveRegion>
            <span className="small muted">Screening the NDA against 10 criteria...</span>
          </LiveRegion>
          <ElapsedSeconds className="small muted" style={{ marginLeft: "auto" }} />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="stack nda-view">
        {header}
        <Banner tone="danger">{state.error}</Banner>
        <Button variant="default" size="sm" onClick={reset} style={{ alignSelf: "flex-start" }}>
          Try again
        </Button>
      </div>
    );
  }

  if (state.status === "done") {
    return <NdaResults result={state.result} onReset={reset} />;
  }

  // idle
  return (
    <div className="stack nda-view">
      {header}
      <Field label="Counterparty (optional)">
        <input
          value={counterparty}
          placeholder="e.g. Acme Inc."
          onChange={(e) => setCounterparty(e.target.value)}
        />
      </Field>
      <Field label="Business context (optional)">
        <textarea
          value={context}
          placeholder="e.g. Evaluating Acme as a data-processing vendor; they will receive our customer PII."
          onChange={(e) => setContext(e.target.value)}
        />
      </Field>
      <Button
        variant="primary"
        className="btn--cta"
        onClick={() =>
          void run({ counterpartyName: counterparty.trim(), businessContext: context.trim() })
        }
      >
        Screen NDA
      </Button>
    </div>
  );
}

function NdaResults({ result, onReset }: { result: NdaTriageResult; onReset: () => void }) {
  // Prefer the playbook-layered classification when present (it flips to RED on a
  // deal-breaker even if the AI said GREEN/YELLOW). Falls back to the AI verdict.
  const classification = result.effectiveClassification ?? result.classification;
  const escalated =
    result.effectiveClassification != null &&
    result.effectiveClassification !== result.classification;

  const segments: DistributionSegment[] = [
    { tone: "green", count: result.passCount, label: "pass" },
    { tone: "yellow", count: result.warnCount, label: "warn" },
    { tone: "red", count: result.failCount, label: "fail" },
  ];

  return (
    <div className="stack nda-view">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="view-title">NDA triage</h1>
        <Button variant="ghost" size="sm" onClick={onReset}>
          New screen
        </Button>
      </div>

      <div className="card nda-verdict stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Badge tone={CLASSIFICATION_TONE[classification]}>
            {CLASSIFICATION_LABEL[classification]}
          </Badge>
          <span className="small muted">{NDA_TYPE_LABEL[result.ndaType]}</span>
        </div>

        {escalated && (
          <Banner tone="warn">
            Escalated to Red by a playbook deal-breaker (the AI screen alone read{" "}
            {result.classification}).
          </Banner>
        )}

        <DistributionBar segments={segments} ariaLabel={`${result.passCount} pass, ${result.warnCount} warn, ${result.failCount} fail`} />
        {result.summary && <p className="small" style={{ margin: 0 }}>{result.summary}</p>}

        <div className="nda-routing small">
          <strong>Next step:</strong> {result.routingRecommendation}
          {result.estimatedTimeline ? (
            <span className="muted"> ({result.estimatedTimeline})</span>
          ) : null}
        </div>
      </div>

      {result.parseWarning && <Banner tone="warn">{result.parseWarning}</Banner>}

      {result.keyIssues.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <h3 className="small muted">Key issues</h3>
          <ul className="nda-list stack" style={{ gap: 3 }}>
            {result.keyIssues.map((k, i) => (
              <li key={i} className="small">{k}</li>
            ))}
          </ul>
        </div>
      )}

      {(result.missingCarveouts.length > 0 || result.problematicProvisions.length > 0) && (
        <div className="row nda-flags" style={{ gap: 8, flexWrap: "wrap" }}>
          {result.missingCarveouts.length > 0 && (
            <div className="stack" style={{ gap: 4, flex: "1 1 45%", minWidth: 0 }}>
              <h3 className="small muted">Missing carve-outs</h3>
              <ul className="nda-list stack" style={{ gap: 3 }}>
                {result.missingCarveouts.map((m, i) => (
                  <li key={i} className="small">{m}</li>
                ))}
              </ul>
            </div>
          )}
          {result.problematicProvisions.length > 0 && (
            <div className="stack" style={{ gap: 4, flex: "1 1 45%", minWidth: 0 }}>
              <h3 className="small muted">Should not be in an NDA</h3>
              <ul className="nda-list stack" style={{ gap: 3 }}>
                {result.problematicProvisions.map((p, i) => (
                  <li key={i} className="small">{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        <h3 className="small muted">10-criteria screen</h3>
        <div className="stack" style={{ gap: 6 }}>
          {result.criteria.map((c) => (
            <CriterionCard key={c.criterionId} criterion={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CriterionCard({ criterion: c }: { criterion: ScreeningCriterion }) {
  const deviation = c.playbookAssessment?.deviationSummary;
  return (
    <div className="card nda-criterion stack" style={{ gap: 4 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="small" style={{ fontWeight: 600 }}>
          {c.criterionName}
        </span>
        <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
      </div>
      {c.findings && <p className="small" style={{ margin: 0 }}>{c.findings}</p>}
      {c.issues.length > 0 && (
        <ul className="nda-list stack" style={{ gap: 2 }}>
          {c.issues.map((issue, i) => (
            <li key={i} className="small">{issue}</li>
          ))}
        </ul>
      )}
      {c.recommendation && (
        <p className="small muted" style={{ margin: 0 }}>
          Recommendation: {c.recommendation}
        </p>
      )}
      {deviation && (
        <p className="small nda-deviation" style={{ margin: 0 }}>
          {deviation}
        </p>
      )}
    </div>
  );
}
