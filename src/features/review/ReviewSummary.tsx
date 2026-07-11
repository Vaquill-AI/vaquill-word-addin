import { Badge, Banner } from "@/ui/primitives";
import type {
  ContractReviewResponse,
  CounterpartyMatch,
  LiabilityExposure,
  OverallRisk,
} from "@/api/types";

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

// "not_addressed" -> "Not addressed", "capped" -> "Capped".
function prettyStatus(status: string): string {
  const words = status.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : status;
}

function capStatusTone(status?: string | null): "green" | "yellow" | "red" | "neutral" {
  const s = status?.toLowerCase?.() ?? "";
  if (s === "capped") return "green";
  if (s === "partial") return "yellow";
  if (s === "uncapped" || s === "not_addressed") return "red";
  return "neutral";
}

function LiabilityPanel({ liability }: { liability: LiabilityExposure }) {
  const carveouts = liability.uncappedCarveouts ?? [];
  const unverified = liability.grounding?.toLowerCase?.() === "unverified";
  return (
    <div className="card stack liability">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 className="small muted">Liability & cap</h3>
        {liability.exposureLevel && (
          <Badge tone={riskTone(liability.exposureLevel)}>
            {riskLabel(liability.exposureLevel)}
          </Badge>
        )}
      </div>

      {liability.verdict && (
        <p className="small" style={{ margin: 0 }}>
          {liability.verdict}
        </p>
      )}

      {(liability.capStatus || liability.capAmount) && (
        <div className="row" style={{ flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {liability.capStatus && (
            <Badge tone={capStatusTone(liability.capStatus)}>
              {prettyStatus(liability.capStatus)}
            </Badge>
          )}
          {liability.capAmount && <span className="small">{liability.capAmount}</span>}
        </div>
      )}

      {liability.capQuote && (
        <div className="stack" style={{ gap: 4 }}>
          <blockquote className="liability__quote">{liability.capQuote}</blockquote>
          {unverified && (
            <span className="small muted">Cap quote not verified against the contract.</span>
          )}
        </div>
      )}

      {carveouts.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <h4 className="small muted" style={{ margin: 0 }}>
            Uncapped carve-outs
          </h4>
          <ul className="liability__carveouts">
            {carveouts.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CounterpartyBanner({ match }: { match: CounterpartyMatch }) {
  const name = match.name || match.vendor || match.slug;
  if (!name) return null;
  const count = match.counterpartyRedlinesCount ?? 0;
  return (
    <Banner tone="info">
      <strong>{name}</strong> paper detected
      {match.flexibility ? ` (${match.flexibility})` : ""}.
      {match.negotiationStrategyNote ? ` ${match.negotiationStrategyNote}` : ""}
      {count > 0
        ? ` Added ${count} counterparty-specific redline${count === 1 ? "" : "s"}.`
        : ""}
    </Banner>
  );
}

export function ReviewSummary({ result }: { result: ContractReviewResponse }) {
  const liability = result.liabilityExposure;
  const counterparty = result.counterpartyMatch;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 14 }}>Summary</h2>
        <Badge tone={riskTone(result.overallRisk)}>{riskLabel(result.overallRisk)}</Badge>
      </div>
      {result.summary && <p style={{ margin: 0 }}>{result.summary}</p>}

      {counterparty && <CounterpartyBanner match={counterparty} />}

      {liability && <LiabilityPanel liability={liability} />}

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
