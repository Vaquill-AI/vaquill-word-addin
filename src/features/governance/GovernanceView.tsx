import { useState } from "react";
import { Badge, Banner, Button, Spinner } from "@/ui/primitives";
import { CheckIcon } from "@/ui/icons";
import { useGovernance } from "./useGovernance";
import type { GovernanceLedger } from "@/lib/governance";
import "./governance.css";

const LEVEL_LABEL: Record<string, string> = {
  manager: "Manager",
  partner: "Partner",
  gc: "GC",
};

function fmt(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusBanner({ ledger }: { ledger: GovernanceLedger }) {
  if (ledger.status === "signed_off") {
    return (
      <div className="gov-banner gov-banner--signed">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Signed off</strong>
          <Badge tone="green">Approved</Badge>
        </div>
        <p className="small" style={{ margin: "4px 0 0" }}>
          {ledger.signedOffBy} on {fmt(ledger.signedOffAt)}.
        </p>
      </div>
    );
  }
  if (ledger.status === "pending_signoff") {
    return (
      <div className="gov-banner gov-banner--pending">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Sign-off required before sending</strong>
          {ledger.requiredLevel && <Badge tone="red">{LEVEL_LABEL[ledger.requiredLevel]} sign-off</Badge>}
        </div>
        {ledger.summary && <p className="small" style={{ margin: "6px 0 0" }}>{ledger.summary}</p>}
      </div>
    );
  }
  return (
    <div className="gov-banner gov-banner--cleared">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>No sign-off required</strong>
        <Badge tone="green">Clear to send</Badge>
      </div>
      {ledger.summary && <p className="small muted" style={{ margin: "4px 0 0" }}>{ledger.summary}</p>}
    </div>
  );
}

function SignoffAction({ onSignoff, busy }: { onSignoff: (note?: string) => void; busy: boolean }) {
  const [note, setNote] = useState("");
  return (
    <div className="card gov-action stack">
      <div className="field">
        <label>Add a note (optional)</label>
        <textarea
          value={note}
          placeholder="e.g. Approved the New York to Delaware change."
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <Button variant="primary" block loading={busy} onClick={() => onSignoff(note || undefined)}>
        <CheckIcon size={14} /> Record my sign-off
      </Button>
      <p className="small muted" style={{ margin: 0 }}>
        Your sign-off is stamped into the document and travels with the file.
      </p>
    </div>
  );
}

export function GovernanceView() {
  const { state, signOff } = useGovernance();

  if (state.status === "loading") {
    return (
      <div className="stack governance-view">
        <div className="row" style={{ gap: 8 }}>
          <Spinner />
          <span className="small muted">Reading the document's sign-off record...</span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="stack governance-view">
        <Banner tone="danger">{state.error}</Banner>
      </div>
    );
  }

  if (state.status === "none" || !state.ledger) {
    return (
      <div className="stack governance-view">
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 15 }}>Sign-off</h1>
          <p className="small muted" style={{ margin: 0 }}>
            This document has no sign-off record yet.
          </p>
        </div>
        <Banner tone="info">
          Run a review, then choose "Record sign-off in document". Vaquill AI stamps the required
          approval into the file itself, so anyone who opens it, even after it is emailed out, sees
          whether it still needs manager, partner, or GC sign-off.
        </Banner>
      </div>
    );
  }

  const { ledger, integrity } = state;

  return (
    <div className="stack governance-view">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 15 }}>Sign-off</h1>
        {integrity === "verified" ? (
          <Badge tone="green">Integrity verified</Badge>
        ) : (
          <Badge tone="yellow">Record modified</Badge>
        )}
      </div>

      <StatusBanner ledger={ledger} />

      {integrity === "modified" && (
        <p className="small muted" style={{ margin: 0 }}>
          This record was changed outside Vaquill AI. Re-run the review to re-establish it.
        </p>
      )}

      <div className="gov-meta small muted">
        {ledger.reviewedBy && <div>Reviewed by {ledger.reviewedBy}</div>}
        {ledger.reviewedAt && <div>on {fmt(ledger.reviewedAt)}</div>}
        {ledger.contractType && <div>Contract type: {ledger.contractType}</div>}
      </div>

      {ledger.status === "pending_signoff" && ledger.reasons.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="small muted">Why sign-off is needed</h2>
          <ul className="gov-reasons small">
            {ledger.reasons.slice(0, 8).map((r, i) => (
              <li key={i}>
                {r.clauseName ? <strong>{r.clauseName}: </strong> : null}
                {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ledger.status === "pending_signoff" && <SignoffAction onSignoff={signOff} busy={state.busy} />}

      <div className="stack" style={{ gap: 4 }}>
        <h2 className="small muted">History</h2>
        <ol className="gov-history">
          {[...ledger.events].reverse().map((e, i) => (
            <li key={i}>
              <span className="gov-history__dot" aria-hidden />
              <div>
                <div className="small">
                  <strong>{e.action === "signed_off" ? "Signed off" : "Review recorded"}</strong> by{" "}
                  {e.actor}
                </div>
                <div className="small muted">{fmt(e.at)}</div>
                {e.note && <div className="small gov-history__note">{e.note}</div>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
