import { useState } from "react";
import { Badge, Banner, Button, Spinner } from "@/ui/primitives";
import { checkCitationStyle, type CitationStyleResult } from "@/api/citationStyle";
import { errorMessage } from "@/api/errors";

type State =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; results: CitationStyleResult[] }
  | { status: "error"; error: string };

/**
 * Optional Bluebook format check for the citations the Authority scan found.
 * Existence verification (does the case resolve to a real authority) is separate;
 * this only judges format and suggests corrected Bluebook forms.
 */
export function CitationStyle({ citations }: { citations: string[] }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const unique = [...new Set(citations.map((c) => c.trim()).filter(Boolean))];
  if (unique.length === 0) return null;

  async function run() {
    setState({ status: "running" });
    try {
      setState({ status: "done", results: await checkCitationStyle(unique) });
    } catch (e) {
      setState({
        status: "error",
        error: errorMessage(e),
      });
    }
  }

  if (state.status === "idle") {
    // Ghost weight: this is the optional secondary action beside the prominent
    // "Insert Table of Authorities" in the grouped footer row.
    return (
      <Button variant="ghost" size="sm" onClick={run}>
        Check citation style (Bluebook)
      </Button>
    );
  }
  if (state.status === "running") {
    return (
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <Spinner />
        <span className="small muted">Checking Bluebook format...</span>
      </div>
    );
  }
  if (state.status === "error") {
    return <Banner tone="danger">{state.error}</Banner>;
  }

  const nonCompliant = state.results.filter((r) => !r.compliant);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="small" style={{ fontWeight: 600 }}>Citation style</span>
        <Badge tone={nonCompliant.length === 0 ? "green" : "yellow"}>
          {nonCompliant.length === 0 ? "All Bluebook-compliant" : `${nonCompliant.length} to fix`}
        </Badge>
      </div>
      {nonCompliant.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>Every citation follows Bluebook format.</p>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {nonCompliant.map((r) => (
            <div key={r.citation} className="card card--pad stack" style={{ gap: 4 }}>
              <p
                className="small"
                style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {r.citation}
              </p>
              {r.issues.map((issue, i) => (
                <p key={i} className="small muted" style={{ margin: 0 }}>- {issue}</p>
              ))}
              {r.suggested && r.suggested !== r.citation && (
                <p className="small" style={{ margin: 0 }}>
                  <strong>Suggested:</strong> {r.suggested}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
