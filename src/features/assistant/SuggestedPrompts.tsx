import type { ReactNode } from "react";

function svg(children: ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

interface Starter {
  title: string;
  prompt: string;
  icon: ReactNode;
}

/** GC-oriented starter actions shown on the empty assistant, as tappable chips. */
const STARTERS: Starter[] = [
  {
    title: "Summarize in plain English",
    prompt: "Summarize this contract in plain English.",
    icon: svg(<path d="M4 6h16M4 12h16M4 18h10" />),
  },
  {
    title: "Find missing protections",
    prompt: "What standard protections is this contract missing?",
    icon: svg(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
  },
  {
    title: "What to negotiate",
    prompt: "What should I negotiate before signing this?",
    icon: svg(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  },
];

export function SuggestedPrompts({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="suggest-chips">
        {STARTERS.map((s) => (
          <button
            key={s.title}
            type="button"
            className="suggest-chip"
            onClick={() => onPick(s.prompt)}
          >
            <span className="suggest-chip__icon" aria-hidden>
              {s.icon}
            </span>
            {s.title}
          </button>
        ))}
      </div>
      <p className="small muted prompts__hint">
        For a scored risk matrix, compliance checklist, or plain-English rewrite of a specific
        clause, select that text in the document and use the tools above.
      </p>
    </div>
  );
}
