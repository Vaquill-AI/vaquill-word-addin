import { useState } from "react";
import { Button, Banner, Spinner, Badge, LiveRegion } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { CheckIcon } from "@/ui/icons";
import { useAuthorityScan } from "./useAuthorityScan";
import { AuthorityItem } from "./AuthorityItem";
import { insertTableOfAuthorities } from "@/office/citations";
import "./authority.css";

export function AuthorityView() {
  const { state, run, reset } = useAuthorityScan();
  const [toaBusy, setToaBusy] = useState(false);
  const [toaDone, setToaDone] = useState(false);
  const [toaError, setToaError] = useState<string | null>(null);

  const busy = state.status === "reading" || state.status === "scanning";
  const verified = state.results.filter((r) => r.verdict === "verified");
  const verifiedWithNames = verified.filter((r) => r.caseName);
  const noMatch = state.results.filter((r) => r.verdict === "no_match").length;
  const other = state.results.length - verified.length - noMatch;

  async function insertToA() {
    setToaBusy(true);
    setToaError(null);
    try {
      await insertTableOfAuthorities(
        verifiedWithNames.map((r) => ({ caseName: r.caseName!, raw: r.raw })),
      );
      setToaDone(true);
      setTimeout(() => setToaDone(false), 1500);
    } catch (e) {
      setToaError((e as Error).message);
    } finally {
      setToaBusy(false);
    }
  }

  if (state.status === "idle") {
    return (
      <div className="stack authority-view">
        <div className="stack" style={{ gap: 4 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <h1 className="view-title">Authority check</h1>
            <InfoTip text="Checks every case citation in the document against Vaquill AI's US case-law corpus. Verified means a real matching case was found. No match can mean a hallucinated, mis-typed, or unreported citation, so confirm it yourself before you rely on it or file." />
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Verify every case citation in this document against Vaquill AI's US case-law corpus.
            Catch citations that do not resolve to a real case before you file or send.
          </p>
        </div>
        <Button variant="primary" block onClick={run}>
          Check citations
        </Button>
      </div>
    );
  }

  return (
    <div className="stack authority-view">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="view-title">Authority check</h1>
        {state.status === "done" && (
          <Button variant="ghost" size="sm" onClick={reset}>
            New check
          </Button>
        )}
      </div>

      {busy && (
        <div className="row authority-progress">
          <Spinner />
          <LiveRegion>
            <span className="small muted">
              {state.status === "reading"
                ? "Reading the document..."
                : `Checking ${state.results.length} of ${state.total} citations...`}
            </span>
          </LiveRegion>
        </div>
      )}

      {state.status === "error" && state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.status === "done" && state.error && <Banner tone="warn">{state.error}</Banner>}

      {state.status === "done" && state.total === 0 && (
        <Banner tone="info">No case citations were found in this document.</Banner>
      )}

      {state.results.length > 0 && (
        <div className="authority-summary">
          <Badge tone="green">{verified.length} verified</Badge>
          {noMatch > 0 && <Badge tone="red">{noMatch} no match</Badge>}
          {other > 0 && <Badge tone="neutral">{other} unresolved</Badge>}
        </div>
      )}

      <div className="stack">
        {state.results.map((r) => (
          <AuthorityItem key={r.raw} result={r} />
        ))}
      </div>

      {state.status === "done" && verifiedWithNames.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <Button variant="default" block onClick={insertToA} loading={toaBusy}>
            {toaDone ? (
              <>
                <CheckIcon size={14} /> Table of Authorities inserted
              </>
            ) : (
              `Insert Table of Authorities (${verifiedWithNames.length})`
            )}
          </Button>
          {toaError && <Banner tone="danger">{toaError}</Banner>}
        </div>
      )}
    </div>
  );
}
