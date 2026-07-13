import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { ViewHeader } from "@/ui/ViewHeader";
import { Badge, Banner, Button, Spinner } from "@/ui/primitives";
import { Avatar } from "@/ui/Avatar";
import { InfoTip } from "@/ui/InfoTip";
import { CheckIcon } from "@/ui/icons";
import { formatRelativeTime, formatExactTime } from "@/lib/relativeTime";
import { lockVaquillControls } from "@/office/contentControls";
import { stampVaquillReview } from "@/office/properties";
import { useGovernance } from "./useGovernance";
import type { GovernanceLedger } from "@/lib/governance";
import "./governance.css";

const LEVEL_LABEL: Record<string, string> = {
  manager: "Manager",
  partner: "Partner",
  gc: "GC",
};

function StatusBanner({ ledger }: { ledger: GovernanceLedger }) {
  if (ledger.status === "signed_off") {
    const roleLabel = ledger.signedOffRole ? LEVEL_LABEL[ledger.signedOffRole] ?? ledger.signedOffRole : null;
    // Success tone is not in the shared Banner component, so this reuses the
    // shared .banner base with a local green modifier (see governance.css).
    return (
      <div className="banner banner--gov-signed">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Signed off</strong>
          <Badge tone="green">{ledger.signoffEnforced ? "Authority verified" : "Attested"}</Badge>
        </div>
        <p className="small" style={{ margin: "4px 0 0" }}>
          {ledger.signedOffBy}
          {ledger.signedOffAt && (
            <span className="muted" title={formatExactTime(ledger.signedOffAt)}>
              {" · "}
              {formatRelativeTime(ledger.signedOffAt)}
            </span>
          )}
        </p>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          {ledger.signoffEnforced
            ? `Authority checked by Vaquill AI${roleLabel ? ` (recorded as ${roleLabel})` : ""}.`
            : "Recorded as an in-file attestation. Authority was not verified."}
        </p>
      </div>
    );
  }
  if (ledger.status === "pending_signoff") {
    return (
      <Banner tone="danger">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Sign-off required before sending</strong>
          {ledger.requiredLevel && <Badge tone="red">{LEVEL_LABEL[ledger.requiredLevel]} sign-off</Badge>}
        </div>
        {ledger.summary && <p className="small" style={{ margin: "6px 0 0" }}>{ledger.summary}</p>}
      </Banner>
    );
  }
  return (
    <Banner tone="info">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>No sign-off required</strong>
        <Badge tone="green">Clear to send</Badge>
      </div>
      {ledger.summary && <p className="small muted" style={{ margin: "4px 0 0" }}>{ledger.summary}</p>}
    </Banner>
  );
}

function SignoffAction({
  onSignoff,
  busy,
  enforced,
  error,
}: {
  onSignoff: (note?: string) => void;
  busy: boolean;
  enforced: boolean;
  error?: string | null;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="gov-action stack">
      <div className="field">
        <label>Add a note (optional)</label>
        <AutoTextarea
          value={note}
          placeholder="e.g. Approved the New York to Delaware change."
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <Button variant="primary" className="btn--cta" loading={busy} onClick={() => onSignoff(note || undefined)}>
        <CheckIcon size={14} /> Record my approval
      </Button>
      {error && <Banner tone="danger">{error}</Banner>}
      <p className="small muted" style={{ margin: 0 }}>
        {enforced
          ? "Your authority is checked on the server before this is recorded."
          : "Stamps your name and level as an attestation in the file (not authority-checked). Save to Vaquill AI first for an enforced approval."}
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
      setNote(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gov-action stack">
      <span className="small" style={{ fontWeight: 600 }}>Lock the approved terms</span>
      <p className="small muted" style={{ margin: 0 }}>
        Make the fields Vaquill AI tagged (amounts, dates, defined terms) read-only, so nobody edits the
        approved numbers after sign-off.
      </p>
      <Button variant={locked ? "default" : "primary"} className="btn--cta" loading={busy} onClick={toggle}>
        {locked ? "Unlock tagged fields" : "Lock tagged fields"}
      </Button>
      {note && <p className="small muted" style={{ margin: 0 }}>{note}</p>}
    </div>
  );
}

function StampPropertiesControl({ ledger }: { ledger: GovernanceLedger }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status =
    ledger.status === "signed_off"
      ? "Signed off"
      : ledger.status === "pending_signoff"
        ? "Pending sign-off"
        : "Reviewed - clear to send";

  async function stamp() {
    setBusy(true);
    setError(null);
    try {
      await stampVaquillReview({
        status,
        by: ledger.signedOffBy || ledger.reviewedBy || undefined,
        at: ledger.signedOffAt || ledger.reviewedAt || undefined,
        contractType: ledger.contractType || undefined,
      });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gov-action stack">
      <span className="small" style={{ fontWeight: 600 }}>
        Stamp status in file properties
      </span>
      <p className="small muted" style={{ margin: 0 }}>
        Writes the review status into the document's standard properties, so it shows in Word's File
        &gt; Info and is read by a document-management system, without opening this pane.
      </p>
      <Button
        variant={done ? "default" : "primary"}
        className="btn--cta"
        loading={busy}
        onClick={stamp}
        disabled={done}
      >
        {done ? (
          <>
            <CheckIcon size={14} /> Stamped in properties
          </>
        ) : (
          "Stamp status"
        )}
      </Button>
      {error && <Banner tone="danger">{error}</Banner>}
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
        <ViewHeader
        title="Sign-off"
        info="The approval record is stored inside this .docx, so it travels with the file even when it is emailed on. It is a tamper-EVIDENT attestation (it flags accidental edits, but the pane does not verify the signer's authority). Record your approval to attest that the required manager, partner, or GC sign-off was obtained; the authority-enforced approval lives in the Vaquill AI web app."
        subtitle="This document has no sign-off record yet."
      />
        <Banner tone="info">
          Run a review, then "Record sign-off in document". The approval is stamped into the file, so
          anyone who opens it sees whether it still needs sign-off.
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

      <StampPropertiesControl ledger={ledger} />

      {integrity === "modified" && (
        <p className="small muted" style={{ margin: 0 }}>
          This record was changed outside Vaquill AI. Re-run the review to re-establish it.
        </p>
      )}

      <div className="gov-meta small muted">
        {ledger.reviewedBy && <div>Reviewed by {ledger.reviewedBy}</div>}
        {ledger.reviewedAt && (
          <div title={formatExactTime(ledger.reviewedAt)}>{formatRelativeTime(ledger.reviewedAt)}</div>
        )}
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

      {ledger.status === "pending_signoff" && (
        <SignoffAction
          onSignoff={signOff}
          busy={state.busy}
          enforced={Boolean(ledger.draftId && ledger.requiredLevel)}
          error={state.error}
        />
      )}

      <div className="stack" style={{ gap: 4 }}>
        <h2 className="small muted">History</h2>
        <ol className="gov-history">
          {[...ledger.events].reverse().map((e, i) => (
            <li key={i}>
              <Avatar name={e.actor || "Unknown"} size={22} />
              <div>
                <div className="small">
                  <strong>{e.action === "signed_off" ? "Signed off" : "Review recorded"}</strong> by{" "}
                  {e.actor}
                </div>
                <div className="small muted" title={formatExactTime(e.at)}>
                  {formatRelativeTime(e.at)}
                </div>
                {e.note && <div className="small gov-history__note">{e.note}</div>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
