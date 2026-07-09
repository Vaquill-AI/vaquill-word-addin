/** GC-oriented starter prompts shown on the empty assistant. */
const PROMPTS = [
  "Identify the top 3 legal risks in this contract.",
  "Summarize this contract in plain English.",
  "What are my key obligations and deadlines?",
  "What standard protections is this contract missing?",
  "Explain the selected clause for a non-lawyer.",
];

export function SuggestedPrompts({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="prompts">
      {PROMPTS.map((p) => (
        <button key={p} type="button" className="prompt" onClick={() => onPick(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}
