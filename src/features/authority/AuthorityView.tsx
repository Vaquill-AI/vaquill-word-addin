import { useState } from "react";
import { Button, Banner, Spinner, Badge } from "@/ui/primitives";
import { useAuthorityScan } from "./useAuthorityScan";
import { AuthorityItem } from "./AuthorityItem";
import { insertTableOfAuthorities } from "@/office/citations";
import "./authority.css";

export function AuthorityView() {
  const { state, run, reset } = useAuthorityScan();
  const [toaBusy, setToaBusy] = useState(false);
  const [toaNote, setToaNote] = useState<string | null>(null);

  const busy = state.status === "reading" || state.status === "scanning";
  const verified = state.results.filter((r) => r.verdict === "verified");
  const noMatch = state.results.filter((r) => r.verdict === "no_match").length;
  const other = state.results.length - verified.length - noMatch;

  async function insertToA() {
    setToaBusy(true);
    setToaNote(null);
    try {
      await insertTableOfAuthorities(
        verified.filter((r) => r.caseName).map((r) => ({ caseName: r.caseName!, raw: r.raw })),
      );
      setToaNote("Table of Authorities inserted at the end of the document.");
    } catch (e) {
      setToaNote((e as Error).message);
    } finally {
      setToaBusy(false);
    }
  }

  if (state.status === "idle") {
    return (
      <div className="stack authority-view">
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 15 }}>Authority check</h1>
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
        <h1 style={{ fontSize: 15 }}>Authority check</h1>
        {state.status === "done" && (
          <Button variant="ghost" size="sm" onClick={reset}>
            New check
          </Button>
        )}
      </div>

      {busy && (
        <div className="row authority-progress">
          <Spinner />
          <span className="small muted">
            {state.status === "reading"
              ? "Reading the document..."
              : `Checking ${state.results.length} of ${state.total} citations...`}
          </span>
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

      {state.status === "done" && verified.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <Button variant="default" block onClick={insertToA} loading={toaBusy}>
            Insert Table of Authorities ({verified.length})
          </Button>
          {toaNote && <span className="small muted">{toaNote}</span>}
        </div>
      )}
    </div>
  );
}
