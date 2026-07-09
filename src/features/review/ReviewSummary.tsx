import { Badge } from "@/ui/primitives";
import type { ContractReviewResponse, OverallRisk } from "@/api/types";

function riskTone(risk: OverallRisk): "green" | "yellow" | "red" | "neutral" {
  const r = risk?.toLowerCase?.() ?? "";
  if (r.includes("green") || r.includes("low")) return "green";
  if (r.includes("red") || r.includes("high")) return "red";
  if (r.includes("yellow") || r.includes("medium")) return "yellow";
  return "neutral";
}

function riskLabel(risk: OverallRisk): string {
  const r = risk?.toLowerCase?.() ?? "";
  if (r.includes("green")) return "Low risk";
  if (r.includes("yellow")) return "Medium risk";
  if (r.includes("red")) return "High risk";
  return risk || "Reviewed";
}

export function ReviewSummary({ result }: { result: ContractReviewResponse }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 14 }}>Summary</h2>
        <Badge tone={riskTone(result.overallRisk)}>{riskLabel(result.overallRisk)}</Badge>
      </div>
      {result.summary && <p style={{ margin: 0 }}>{result.summary}</p>}

      {result.missingClauses.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <h3 className="small muted">Missing clauses</h3>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {result.missingClauses.map((c) => (
              <Badge key={c} tone="yellow">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {result.negotiationPriorities.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <h3 className="small muted">Negotiation priorities</h3>
          {result.negotiationPriorities.map((p) => (
            <div key={p.tier} className="small">
              <strong>{p.tierLabel}</strong>
              <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>
                {p.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
