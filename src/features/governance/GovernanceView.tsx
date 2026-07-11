import { useState } from "react";
import { Badge, Banner, Button, Spinner } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { CheckIcon } from "@/ui/icons";
import { lockVaquillControls } from "@/office/contentControls";
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
        <CheckIcon size={14} /> Record my approval
      </Button>
      <p className="small muted" style={{ margin: 0 }}>
        This records your name and the required level as an attestation stamped into the file
        (tamper-evident, not enforced): the pane does not verify your authority. For an
        authority-checked approval that blocks on insufficient rank, use the saved draft in the
        Vaquill AI web app.
      </p>
    </div>
  );
}

function LockControl() {
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setNote(null);
    try {
      const n = await lockVaquillControls(!locked);
      if (n === 0 && !locked) {
        setNote("No tagged fields found. Use 'Tag key fields' on the Review tab first.");
      } else {
        setLocked(!locked);
        setNote(`${!locked ? "Locked" : "Unlocked"} ${n} tagged field${n === 1 ? "" : "s"}.`);
      }
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card gov-action stack">
      <span className="small" style={{ fontWeight: 600 }}>Lock the approved terms</span>
      <p className="small muted" style={{ margin: 0 }}>
        Make the fields Vaquill AI tagged (amounts, dates, defined terms) read-only, so nobody edits the
        approved numbers after sign-off.
      </p>
      <Button variant={locked ? "default" : "primary"} block loading={busy} onClick={toggle}>
        {locked ? "Unlock tagged fields" : "Lock tagged fields"}
      </Button>
      {note && <p className="small muted" style={{ margin: 0 }}>{note}</p>}
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
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <h1 className="view-title">Sign-off</h1>
            <InfoTip text="The approval record is stored inside this .docx, so it travels with the file even when it is emailed on. It is a tamper-EVIDENT attestation (it flags accidental edits, but the pane does not verify the signer's authority). Record your approval to attest that the required manager, partner, or GC sign-off was obtained; the authority-enforced approval lives in the Vaquill AI web app." />
          </div>
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
        <div className="row" style={{ gap: 6, alignItems: "center" }}>
          <h1 className="view-title">Sign-off</h1>
          <InfoTip side="left" text="This approval record lives inside the .docx and travels with the file when emailed. 'Integrity verified' flags that the record has not been accidentally edited since it was stamped -- a tamper-EVIDENT check, not tamper-proof (a determined user could strip or recompute the signature). 'Record modified' means the stored record no longer matches its signature, so treat it with caution." />
        </div>
        {integrity === "verified" ? (
          <Badge tone="green">Integrity verified</Badge>
        ) : integrity === "modified" ? (
          <Badge tone="yellow">Record modified</Badge>
        ) : (
          <Badge tone="neutral">Integrity not recorded</Badge>
        )}
      </div>

      <StatusBanner ledger={ledger} />

      {ledger.status === "signed_off" && <LockControl />}

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
