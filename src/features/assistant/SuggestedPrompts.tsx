/** GC-oriented starter prompts shown on the empty assistant. */
const PROMPTS = [
  "Summarize this contract in plain English.",
  "What standard protections is this contract missing?",
  "What should I negotiate before signing this?",
];

export function SuggestedPrompts({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="prompts">
      <p className="small muted prompts__hint">
        For a scored risk matrix, compliance checklist, or plain-English rewrite of a specific
        clause, select that text in the document and use the tools above.
      </p>
      {PROMPTS.map((p) => (
        <button key={p} type="button" className="prompt" onClick={() => onPick(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}
