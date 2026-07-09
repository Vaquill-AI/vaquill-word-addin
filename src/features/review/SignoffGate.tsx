import { Banner, Badge } from "@/ui/primitives";
import type { ReviewApprovalGate } from "@/api/types";

const LEVEL_LABEL: Record<string, string> = {
  manager: "Manager sign-off",
  partner: "Partner sign-off",
  gc: "GC sign-off",
};

/**
 * Deterministic, server-computed sign-off gate. This is review governance that
 * travels with the document: before sending to a counterparty, it tells you
 * whether the deal needs manager, partner, or GC approval and why.
 * Never recomputed client-side.
 */
export function SignoffGate({ gate }: { gate: ReviewApprovalGate }) {
  if (!gate.required) {
    return (
      <Banner tone="info">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>No sign-off required</strong>
          <Badge tone="green">Clear to send</Badge>
        </div>
        {gate.summary && <p className="small muted" style={{ margin: "4px 0 0" }}>{gate.summary}</p>}
      </Banner>
    );
  }

  return (
    <Banner tone="danger">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>Sign-off required before sending</strong>
        {gate.level && <Badge tone="red">{LEVEL_LABEL[gate.level] ?? gate.level}</Badge>}
      </div>
      {gate.summary && <p className="small" style={{ margin: "6px 0" }}>{gate.summary}</p>}
      {gate.dealBreakerCount > 0 && (
        <p className="small" style={{ margin: "0 0 4px" }}>
          {gate.dealBreakerCount} deal-breaker{gate.dealBreakerCount === 1 ? "" : "s"} flagged.
        </p>
      )}
      {gate.reasons.length > 0 && (
        <ul className="signoff__reasons small">
          {gate.reasons.slice(0, 6).map((r, i) => (
            <li key={i}>
              {r.clauseName ? <strong>{r.clauseName}: </strong> : null}
              {r.reason ?? r.level}
            </li>
          ))}
        </ul>
      )}
    </Banner>
  );
}
