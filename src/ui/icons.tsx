/** Minimal inline SVG icons (no icon library dependency, no emoji). */
type P = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function LocateIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

export function CheckIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function XIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function UndoIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M3 2v6h6" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8" />
    </svg>
  );
}

export function CopyIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <rect x="9" y="9" width="12" height="12" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function ChevronIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function StopIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function InfoIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/* ---- Tab icons (Fluent-style line) ---- */
export function ReviewIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  );
}

export function DraftIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

export function AssistantIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
    </svg>
  );
}

export function PlaybookIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
