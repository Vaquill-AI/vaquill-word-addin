import { useState } from "react";
import { Button, Banner } from "@/ui/primitives";
import { explainClause, type ExplainResult } from "@/api/clause-tools";
import { insertCommentOnSelection } from "@/office/selection";
import { ApiError, friendlyMessage } from "@/api/errors";

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 3 }}>
      <h3 className="small muted">{title}</h3>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((it, i) => (
          <li key={i} className="small">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Explain the selected clause in plain English, optionally as a Word comment. */
export function ExplainTool({ clauseText }: { clauseText: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [commented, setCommented] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    setCommented(false);
    try {
      setResult(await explainClause(clauseText));
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addComment() {
    if (!result) return;
    try {
      await insertCommentOnSelection(result.explanation);
      setCommented(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="stack">
      <Button variant="primary" block onClick={run} loading={busy}>
        Explain in plain English
      </Button>

      {error && <Banner tone="danger">{error}</Banner>}

      {result && (
        <div className="card tool-result stack">
          <p style={{ margin: 0 }}>{result.explanation}</p>
          <List title="Key obligations" items={result.keyObligations} />
          <List title="Risks" items={result.risks} />
          <List title="Applicable law" items={result.applicableActs} />
          <Button variant="ghost" size="sm" onClick={addComment} disabled={commented}>
            {commented ? "Added as comment" : "Add as Word comment"}
          </Button>
        </div>
      )}
    </div>
  );
}
