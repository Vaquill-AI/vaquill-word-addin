import { useState } from "react";
import { Button, Banner, Badge } from "@/ui/primitives";
import { assessRisk, type RiskResult, type RiskFactor, type MitigationOption } from "@/api/clause-tools";
import { ApiError, friendlyMessage } from "@/api/errors";

const MIN_CHARS = 50; // Backend requires documentText >= 50 chars.

type BadgeTone = "green" | "yellow" | "red" | "neutral" | "brand";

function riskTone(level: string | undefined): BadgeTone {
  switch (level) {
    case "green":
      return "green";
    case "yellow":
      return "yellow";
    case "orange":
    case "red":
      return "red";
    default:
      return "neutral";
  }
}

function titleCase(v: string | undefined): string {
  if (!v) return "";
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function FactorList({ title, items }: { title: string; items: RiskFactor[] }) {
  if (items.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 3 }}>
      <h3 className="small muted">{title}</h3>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((f, i) => (
          <li key={i} className="small">
            {f.name ? <strong>{f.name}. </strong> : null}
            {f.description ?? f.impact ?? ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function mitigationMeta(m: MitigationOption): string {
  const parts: string[] = [];
  if (m.effectiveness) parts.push(`effectiveness: ${m.effectiveness}`);
  if (m.effort) parts.push(`effort: ${m.effort}`);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function MitigationList({ items }: { items: MitigationOption[] }) {
  if (items.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 3 }}>
      <h3 className="small muted">Mitigation options</h3>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((m, i) => (
          <li key={i} className="small">
            {m.description ?? ""}
            {mitigationMeta(m)}
            {m.recommended ? " - recommended" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Structured 5x5 risk assessment of the selected text. */
export function RiskTool({ clauseText }: { clauseText: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RiskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tooShort = clauseText.trim().length < MIN_CHARS;

  async function run() {
    if (tooShort) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await assessRisk(clauseText));
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const contributing = result?.contributingFactors ?? [];
  const mitigating = result?.mitigatingFactors ?? [];
  const mitigations = result?.mitigationOptions ?? [];
  const esc = result?.escalation ?? null;

  return (
    <div className="stack">
      {tooShort ? (
        <Banner tone="info">Select at least {MIN_CHARS} characters to assess legal risk.</Banner>
      ) : (
        <Button variant="primary" className="btn--cta" onClick={run} loading={busy}>
          Assess legal risk
        </Button>
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      {result && (
        <div className="card tool-result stack">
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone={riskTone(result.riskLevel)}>
              {titleCase(result.riskLevel) || "Risk"}
              {typeof result.riskScore === "number" ? ` - ${result.riskScore}/25` : ""}
            </Badge>
            {result.riskCategory && <span className="small muted">{titleCase(result.riskCategory)}</span>}
          </div>

          {result.summary && <p style={{ margin: 0 }}>{result.summary}</p>}

          <div className="stack" style={{ gap: 4 }}>
            {(result.severity || typeof result.severityValue === "number") && (
              <p className="small" style={{ margin: 0 }}>
                <strong>Severity:</strong> {titleCase(result.severity)}
                {typeof result.severityValue === "number" ? ` (${result.severityValue}/5)` : ""}
                {result.severityRationale ? ` - ${result.severityRationale}` : ""}
              </p>
            )}
            {(result.likelihood || typeof result.likelihoodValue === "number") && (
              <p className="small" style={{ margin: 0 }}>
                <strong>Likelihood:</strong> {titleCase(result.likelihood)}
                {typeof result.likelihoodValue === "number" ? ` (${result.likelihoodValue}/5)` : ""}
                {result.likelihoodRationale ? ` - ${result.likelihoodRationale}` : ""}
              </p>
            )}
          </div>

          <FactorList title="Contributing factors" items={contributing} />
          <FactorList title="Mitigating factors" items={mitigating} />
          <MitigationList items={mitigations} />

          {esc && (esc.escalateTo || esc.reason) && (
            <div className="stack" style={{ gap: 3 }}>
              <h3 className="small muted">Escalation</h3>
              <p className="small" style={{ margin: 0 }}>
                {esc.escalateTo ? <strong>{esc.escalateTo}. </strong> : null}
                {esc.reason ?? ""}
                {esc.urgency ? ` (${titleCase(esc.urgency)})` : ""}
                {esc.outsideCounselRecommended ? " Outside counsel recommended." : ""}
              </p>
            </div>
          )}

          {result.residualRisk && (
            <p className="small muted" style={{ margin: 0 }}>
              Residual risk after mitigation: {result.residualRisk}
            </p>
          )}
          {result.parseWarning && <Banner tone="warn">{result.parseWarning}</Banner>}
        </div>
      )}
    </div>
  );
}
