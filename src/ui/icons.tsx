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
