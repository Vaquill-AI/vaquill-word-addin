import { useState } from "react";
import { Button, Banner, Badge, SegmentedControl, IconButton } from "@/ui/primitives";
import { CheckIcon, CopyIcon } from "@/ui/icons";
import { InlineDiff } from "@/features/review/InlineDiff";
import {
  rewriteClause,
  type RewriteResult,
  type RewriteMode,
  type RewriteTone,
} from "@/api/clause-tools";
import { replaceSelectionTracked } from "@/office/selection";
import { ImproveButton } from "@/ui/ImproveButton";
import { useImprovePrompt } from "@/lib/useImprovePrompt";
import { improveLegalToolPrompt } from "@/api/improve-prompt";
import { errorMessage } from "@/api/errors";

const MODE_OPTIONS: { value: RewriteMode; label: string }[] = [
  { value: "rewrite", label: "Rewrite" },
  { value: "simplify", label: "Simplify" },
  { value: "formalize", label: "Formalize" },
];

const TONE_OPTIONS: { value: RewriteTone; label: string }[] = [
  { value: "protective", label: "Protective" },
  { value: "balanced", label: "Balanced" },
  { value: "permissive", label: "Permissive" },
];

/**
 * Rewrite the selected clause, then apply as a tracked change.
 *
 * The intent (rewrite / simplify / formalize) and stance (protective /
 * balanced / permissive) are sent as structured `mode` + `tone` fields rather
 * than folded into free text. The optional note only adds extra guidance.
 *
 * When the server flags the result as AI-generated (source=generated or
 * reviewRequired), Apply is gated behind an explicit review acknowledgement.
 */
export function RewriteTool({ clauseText }: { clauseText: string }) {
  const [mode, setMode] = useState<RewriteMode>("rewrite");
  const [tone, setTone] = useState<RewriteTone>("balanced");
  const [instruction, setInstruction] = useState("");
  const guide = useImprovePrompt(improveLegalToolPrompt, instruction, setInstruction);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prov = result?.provenance;
  const needsReview = prov
    ? prov.reviewRequired === true || prov.source === "generated" || prov.source === "tier_b_rewrite"
    : false;

  async function copy() {
    setCopyNote(null);
    try {
      await navigator.clipboard.writeText(result?.rewritten ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyNote("Could not copy to the clipboard.");
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    setApplied(false);
    setCopied(false);
    setReviewed(false);
    try {
      const r = await rewriteClause(clauseText, { mode, tone, instruction: instruction || undefined });
      setResult(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!result) return;
    if (needsReview && !reviewed) return;
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
      <div className="field">
        <label>How should it change?</label>
        <SegmentedControl<RewriteMode>
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
          label="Rewrite mode"
        />
      </div>

      <div className="field">
        <label>Stance</label>
        <SegmentedControl<RewriteTone>
          options={TONE_OPTIONS}
          value={tone}
          onChange={setTone}
          label="Rewrite tone"
        />
      </div>

      <div className="field">
        <div className="field__labelrow">
          <label>Extra guidance (optional)</label>
          <ImproveButton
            improving={guide.improving}
            disabled={!guide.canImprove}
            onClick={() => void guide.improve()}
          />
        </div>
        <textarea
          value={instruction}
          placeholder="e.g. Cap liability at fees paid in the prior 12 months."
          onChange={(e) => setInstruction(e.target.value)}
        />
        {guide.note && <span className="small muted">{guide.note}</span>}
      </div>

      <Button variant="primary" className="btn--cta" onClick={run} loading={busy && !result}>
        Rewrite clause
      </Button>

      {error && <Banner tone="danger">{error}</Banner>}

      {result && (
        <div className="card tool-result stack">
          {needsReview && (
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <Badge tone="yellow">AI-generated - review before applying</Badge>
            </div>
          )}
          {result.changesSummary && (
            <p className="small muted" style={{ margin: 0 }}>
              {result.changesSummary}
            </p>
          )}
          <InlineDiff before={result.original} after={result.rewritten} />

          {needsReview && (
            <label className="small" style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>I have reviewed this AI-generated text and it is accurate.</span>
            </label>
          )}

          <div className="row" style={{ gap: 8 }}>
            <Button
              variant="primary"
              size="sm"
              onClick={apply}
              loading={busy}
              disabled={applied || (needsReview && !reviewed)}
            >
              <CheckIcon size={14} /> {applied ? "Applied" : "Apply as tracked change"}
            </Button>
            <IconButton label={copied ? "Copied" : "Copy"} onClick={copy}>
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            </IconButton>
          </div>
          {copyNote && <span className="small muted">{copyNote}</span>}
        </div>
      )}
    </div>
  );
}
