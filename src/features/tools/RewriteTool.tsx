import { useState } from "react";
import { Button, Banner } from "@/ui/primitives";
import { CheckIcon, CopyIcon } from "@/ui/icons";
import { InlineDiff } from "@/features/review/InlineDiff";
import { rewriteClause, type RewriteResult } from "@/api/clause-tools";
import { replaceSelectionTracked } from "@/office/selection";
import { ApiError, friendlyMessage } from "@/api/errors";

const PRESETS = [
  "Make it mutual",
  "Soften for the counterparty",
  "Tighten and simplify",
  "Favor our side",
  "Add a materiality qualifier",
];

/** Rewrite the selected clause to an instruction, then apply as a tracked change. */
export function RewriteTool({ clauseText }: { clauseText: string }) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result?.rewritten ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable; no-op */
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    setApplied(false);
    setCopied(false);
    try {
      const r = await rewriteClause(clauseText, instruction || "Rewrite for clarity and legal precision");
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      await replaceSelectionTracked(result.rewritten);
      setApplied(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        {PRESETS.map((p) => (
          <button key={p} className="chip" onClick={() => setInstruction(p)} type="button">
            {p}
          </button>
        ))}
      </div>

      <div className="field">
        <label>How should it change?</label>
        <textarea
          value={instruction}
          placeholder="e.g. Make liability mutual and cap it at fees paid."
          onChange={(e) => setInstruction(e.target.value)}
        />
      </div>

      <Button variant="primary" block onClick={run} loading={busy && !result}>
        Rewrite clause
      </Button>

      {error && <Banner tone="danger">{error}</Banner>}

      {result && (
        <div className="card tool-result stack">
          {result.changesSummary && <p className="small muted" style={{ margin: 0 }}>{result.changesSummary}</p>}
          <InlineDiff before={result.original} after={result.rewritten} />
          <div className="row" style={{ gap: 8 }}>
            <Button variant="primary" size="sm" onClick={apply} loading={busy} disabled={applied}>
              <CheckIcon size={14} /> {applied ? "Applied" : "Apply as tracked change"}
            </Button>
            <Button variant="ghost" size="sm" onClick={copy}>
              {copied ? (
                <>
                  <CheckIcon size={14} /> Copied
                </>
              ) : (
                <>
                  <CopyIcon size={14} /> Copy
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
