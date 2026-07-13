import { useState } from "react";
import { Button, Banner } from "@/ui/primitives";
import { CommentIcon, CheckIcon } from "@/ui/icons";
import { explainClause, type ExplainResult } from "@/api/clause-tools";
import { insertCommentOnSelection } from "@/office/selection";
import { errorMessage } from "@/api/errors";

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
  const [commenting, setCommenting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    setCommented(false);
    try {
      setResult(await explainClause(clauseText));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function addComment() {
    if (!result || commenting) return;
    setCommenting(true);
    setError(null);
    try {
      await insertCommentOnSelection(result.explanation);
      setCommented(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCommenting(false);
    }
  }

  return (
    <div className="stack">
      <Button variant="primary" className="btn--cta" onClick={run} loading={busy}>
        Explain this clause
      </Button>

      {error && <Banner tone="danger">{error}</Banner>}

      {result && (
        <div className="card tool-result stack">
          <p style={{ margin: 0 }}>{result.explanation}</p>
          <List title="Key obligations" items={result.keyObligations} />
          <List title="Risks" items={result.risks} />
          <List title="Applicable law" items={result.applicableActs} />
          <Button
            variant="ghost"
            size="sm"
            onClick={addComment}
            disabled={commented}
            loading={commenting}
          >
            {commented ? (
              <>
                <CheckIcon size={14} /> Added as comment
              </>
            ) : (
              <>
                <CommentIcon size={14} /> Add as Word comment
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
