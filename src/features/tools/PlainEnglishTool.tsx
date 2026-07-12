import { useState } from "react";
import { Button, Banner } from "@/ui/primitives";
import { plainEnglish } from "@/api/clause-tools";
import { insertCommentOnSelection } from "@/office/selection";
import { ApiError, friendlyMessage } from "@/api/errors";

/** Summarize the selected text in plain English (legal-tools endpoint). */
export function PlainEnglishTool({ clauseText }: { clauseText: string }) {
  const [busy, setBusy] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [commented, setCommented] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setExplanation(null);
    setCommented(false);
    try {
      const r = await plainEnglish(clauseText);
      setExplanation(r?.explanation ?? "");
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addComment() {
    if (!explanation || commenting) return;
    setCommenting(true);
    setError(null);
    try {
      await insertCommentOnSelection(explanation);
      setCommented(true);
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setCommenting(false);
    }
  }

  return (
    <div className="stack">
      <Button variant="primary" className="btn--cta" onClick={run} loading={busy}>
        Explain in plain English
      </Button>

      {error && <Banner tone="danger">{error}</Banner>}

      {explanation !== null && (
        <div className="card tool-result stack">
          {explanation.trim() ? (
            <p style={{ margin: 0 }}>{explanation}</p>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              No plain-English summary was returned. Try selecting more text.
            </p>
          )}
          {explanation.trim() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={addComment}
              disabled={commented}
              loading={commenting}
            >
              {commented ? "Added as comment" : "Add as Word comment"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
