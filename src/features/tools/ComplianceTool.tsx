import { useState } from "react";
import { Button, Banner, Badge, Field } from "@/ui/primitives";
import {
  checkCompliance,
  type ComplianceResult,
  type ComplianceStatusValue,
} from "@/api/clause-tools";
import { ApiError, friendlyMessage } from "@/api/errors";

const MIN_CHARS = 100; // Backend requires documentText >= 100 chars.

// US-relevant supported regulations (subset of the backend SUPPORTED_REGULATIONS
// with a full requirement checklist). Value = backend RegulationType enum value.
const REGULATIONS: { value: string; label: string }[] = [
  { value: "ccpa", label: "CCPA (California privacy)" },
  { value: "hipaa", label: "HIPAA (health)" },
  { value: "glba", label: "GLBA (financial)" },
  { value: "ferpa", label: "FERPA (education records)" },
  { value: "tcpa", label: "TCPA (telemarketing/SMS)" },
  { value: "sox", label: "SOX (financial reporting)" },
  { value: "pci_dss", label: "PCI DSS (payment cards)" },
  { value: "soc2", label: "SOC 2 (security controls)" },
  { value: "gdpr", label: "GDPR (EU data protection)" },
];

type BadgeTone = "green" | "yellow" | "red" | "neutral" | "brand";

function statusTone(status: ComplianceStatusValue | string | undefined): BadgeTone {
  switch (status) {
    case "compliant":
      return "green";
    case "partially_compliant":
      return "yellow";
    case "non_compliant":
      return "red";
    default:
      return "neutral";
  }
}

function statusLabel(status: ComplianceStatusValue | string | undefined): string {
  switch (status) {
    case "compliant":
      return "Compliant";
    case "partially_compliant":
      return "Partial";
    case "non_compliant":
      return "Gap";
    case "not_applicable":
      return "N/A";
    default:
      return "Unknown";
  }
}

/** Structured compliance check of the selected text against a chosen regulation. */
export function ComplianceTool({ clauseText }: { clauseText: string }) {
  const [regulation, setRegulation] = useState<string>(REGULATIONS[0]?.value ?? "ccpa");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tooShort = clauseText.trim().length < MIN_CHARS;
  const requirements = result?.requirements ?? [];
  const gaps = result?.gaps ?? [];

  async function run() {
    if (tooShort) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await checkCompliance(clauseText, regulation));
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Field label="Check against">
        <select value={regulation} onChange={(e) => setRegulation(e.target.value)}>
          {REGULATIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>

      {tooShort ? (
        <Banner tone="info">Select at least {MIN_CHARS} characters to run a compliance check.</Banner>
      ) : (
        <Button variant="primary" block onClick={run} loading={busy}>
          Check compliance
        </Button>
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      {result && (
        <div className="card tool-result stack">
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone={statusTone(result.overallStatus)}>{statusLabel(result.overallStatus)}</Badge>
            {typeof result.complianceScore === "number" && (
              <span className="small muted">{result.complianceScore}% compliant</span>
            )}
          </div>

          {result.summary && <p style={{ margin: 0 }}>{result.summary}</p>}

          {requirements.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <h3 className="small muted">Requirements</h3>
              <ul className="checklist">
                {requirements.map((req, i) => (
                  <li key={req.requirementId ?? i} className="checklist__item">
                    <Badge tone={statusTone(req.status)}>{statusLabel(req.status)}</Badge>
                    <div className="stack" style={{ gap: 2 }}>
                      <span className="small">
                        <strong>{req.requirementName ?? req.requirementId ?? "Requirement"}</strong>
                        {req.regulationReference ? ` - ${req.regulationReference}` : ""}
                      </span>
                      {req.findings && (
                        <span className="small muted">{req.findings}</span>
                      )}
                      {req.recommendation && (
                        <span className="small">Fix: {req.recommendation}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {gaps.length > 0 && (
            <div className="stack" style={{ gap: 3 }}>
              <h3 className="small muted">Gaps</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {gaps.map((g, i) => (
                  <li key={i} className="small">
                    <strong>{g.gapName ?? "Gap"}. </strong>
                    {g.description ?? ""}
                    {g.remediation ? ` Remediation: ${g.remediation}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.parseWarning && <Banner tone="warn">{result.parseWarning}</Banner>}
        </div>
      )}
    </div>
  );
}
