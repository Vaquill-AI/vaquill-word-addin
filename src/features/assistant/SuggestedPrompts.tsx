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

const SUMMARIZE: Starter = {
  title: "Summarize in plain English",
  prompt: "Summarize this contract in plain English.",
  icon: svg(<path d="M4 6h16M4 12h16M4 18h10" />),
};
const MISSING: Starter = {
  title: "Find missing protections",
  prompt: "What standard protections is this contract missing?",
  icon: svg(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
};
const NEGOTIATE: Starter = {
  title: "What to negotiate",
  prompt: "What should I negotiate before signing this?",
  icon: svg(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
};
const CLOCK = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
const SHIELD = svg(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />);

/** Generic GC starters, shown when the contract type isn't recognized. */
const GENERIC_STARTERS: Starter[] = [SUMMARIZE, MISSING, NEGOTIATE];

// Type-tailored starters. Best-effort: chosen from a lightweight client-side
// keyword scan (no server classification), always anchored by SUMMARIZE. Only
// suggestions, so a wrong guess is low-harm.
const STARTERS_BY_TYPE: Record<string, Starter[]> = {
  nda: [
    SUMMARIZE,
    {
      title: "Is the term reasonable?",
      prompt:
        "Is the confidentiality term and survival period in this NDA reasonable? Flag anything unusual.",
      icon: CLOCK,
    },
    {
      title: "Check the carve-outs",
      prompt:
        "Review the exclusions from confidential information in this NDA. Are the standard carve-outs (public, independently developed, already known, required by law) present?",
      icon: SHIELD,
    },
  ],
  msa: [
    SUMMARIZE,
    {
      title: "Where's the liability cap?",
      prompt:
        "What is the limitation of liability in this agreement, and are there uncapped carve-outs I should worry about?",
      icon: SHIELD,
    },
    NEGOTIATE,
  ],
  employment: [
    SUMMARIZE,
    {
      title: "Restrictive covenants",
      prompt:
        "Summarize the non-compete, non-solicit, and confidentiality obligations in this agreement and whether they are enforceable.",
      icon: SHIELD,
    },
    NEGOTIATE,
  ],
  lease: [
    SUMMARIZE,
    {
      title: "Key dates and renewals",
      prompt:
        "List the key dates in this lease: term, renewal options, notice periods, and rent escalation.",
      icon: CLOCK,
    },
    NEGOTIATE,
  ],
};

/**
 * Lightweight client-side contract-type guess from the document text, used only
 * to pick which starter chips to show. Not authoritative (the real classifier
 * isn't wired here); returns null when nothing scores clearly.
 */
export function detectContractType(text: string): string | null {
  const t = text.slice(0, 6000).toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));
  if (has("non-disclosure", "nondisclosure", "confidentiality agreement", "mutual nda")) return "nda";
  if (has("master services agreement", "master service agreement", "statement of work", "master agreement"))
    return "msa";
  if (has("employment agreement", "at-will", "at will employment", "offer letter", "employee will"))
    return "employment";
  if (has("lease agreement", "landlord", "tenant", "leased premises")) return "lease";
  return null;
}

/** GC-oriented starter actions shown on the empty assistant, as tappable chips.
 *  When `contractType` is recognized, the chips are tailored to it. */
export function SuggestedPrompts({
  onPick,
  contractType,
}: {
  onPick: (prompt: string) => void;
  contractType?: string | null;
}) {
  const starters = (contractType && STARTERS_BY_TYPE[contractType]) || GENERIC_STARTERS;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="suggest-chips">
        {starters.map((s) => (
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
        Select a clause, then open Tools for a scored risk, compliance, or rewrite.
      </p>
    </div>
  );
}
