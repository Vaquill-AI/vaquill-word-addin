import { useState } from "react";
import { Banner, Button, Field, Spinner, LiveRegion } from "@/ui/primitives";
import { ViewHeader } from "@/ui/ViewHeader";
import { RedlineCard } from "@/features/review/RedlineCard";
import { editDocument, editToRedline } from "@/api/edit";
import { detectContractType } from "@/features/assistant/SuggestedPrompts";
import { readFullDocumentText } from "@/office/document";
import { errorMessage } from "@/api/errors";
import type { RedlineSuggestion } from "@/api/types";
import type { Decision } from "@/features/review/decisions";

type State =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "review"; redlines: RedlineSuggestion[] }
  | { status: "error"; error: string };

/**
 * Whole-document edit mode: describe a change in plain English, get grounded
 * redlines across the document, accept/reject each. Reuses the review
 * RedlineCard for rendering + tracked-change apply.
 */
export function EditView() {
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});

  const decisionOf = (i: number): Decision => decisions[i] ?? "pending";
  const setDecision = (i: number, d: Decision) => setDecisions((p) => ({ ...p, [i]: d }));

  async function generate() {
    const instr = instruction.trim();
    if (!instr) return;
    setState({ status: "generating" });
    setDecisions({});
    try {
      const text = await readFullDocumentText();
      const contractType = detectContractType(text) ?? undefined;
      const edits = await editDocument(text, instr, contractType);
      setState({ status: "review", redlines: edits.map(editToRedline) });
    } catch (e) {
      setState({
        status: "error",
        error: errorMessage(e),
      });
    }
  }

  return (
    <div className="stack">
      <ViewHeader
        title="Edit document"
        info="Describe a change in plain English and get grounded redlines across the whole document. Each edit is anchored to real text in the document and applied as a tracked change you accept or reject."
        subtitle="Describe the changes you want. Vaquill AI proposes redlines you can accept or reject."
      />

      <Field label="Instruction">
        <textarea
          value={instruction}
          rows={3}
          placeholder="e.g. Make this more favorable to the customer: cap liability, soften payment penalties, add a termination-for-convenience right."
          onChange={(e) => setInstruction(e.target.value)}
        />
      </Field>
      <Button
        variant="primary"
        className="btn--cta"
        onClick={generate}
        loading={state.status === "generating"}
        disabled={!instruction.trim() || state.status === "generating"}
      >
        Generate edits
      </Button>

      {state.status === "generating" && (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner />
          <LiveRegion>
            <span className="small muted">Reading the document and drafting edits...</span>
          </LiveRegion>
        </div>
      )}

      {state.status === "error" && <Banner tone="danger">{state.error}</Banner>}

      {state.status === "review" &&
        (state.redlines.length === 0 ? (
          <Banner tone="info">
            No grounded edits were proposed for that instruction. Try being more specific.
          </Banner>
        ) : (
          <div className="stack">
            <span className="small muted">
              {state.redlines.length} proposed edit{state.redlines.length === 1 ? "" : "s"}
            </span>
            {state.redlines.map((r, i) => (
              <RedlineCard
                key={`${r.clauseName}-${i}`}
                redline={r}
                index={i}
                decision={decisionOf(i)}
                onDecision={setDecision}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
