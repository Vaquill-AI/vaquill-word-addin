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

export function FormatIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M4 6h16M4 12h10M4 18h13" />
    </svg>
  );
}

export function BookIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

export function GaugeIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M12 14l3.5-3.5" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}

export function HashIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </svg>
  );
}

export function ScaleIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </svg>
  );
}

export function FolderIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

export function GlobeIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function UploadIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}

export function HelpIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
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

export function PlusIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}

export function AlertTriangleIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function CommentIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function RefreshIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
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

export function ArrowLeftIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export function PlayIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

export function TrashIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
    </svg>
  );
}

export function EditIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

export function WandIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
      <path d="M5 3v4M3 5h4M19 17v4M17 19h4" />
    </svg>
  );
}

export function ShieldCheckIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ToolsIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function FillIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h4" />
    </svg>
  );
}

export function RedactIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <rect x="3" y="5" width="18" height="5" rx="1" fill="currentColor" stroke="none" />
      <path d="M4 14h7M4 18h10" />
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

export function SettingsIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/* ---- Tab icons (Fluent-style line) ---- */
export function HomeIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

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

/** Open book: the Research surface (search + read US statutes). */
export function ResearchIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

/** Two overlapping pages: the Document Compare tool. */
export function CompareIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <rect x="3" y="4" width="11" height="16" rx="1.5" />
      <path d="M17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-1" />
    </svg>
  );
}

/** Downward arrow into a tray: download the redline .docx. */
export function DownloadIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M12 3v12M7 10l5 5 5-5" />
    </svg>
  );
}

/** Paper plane: the Send-ready pre-flight hub. */
export function SendIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </svg>
  );
}

/** Chain link: the cross-reference integrity checker. */
export function LinkIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** Quotation marks: the defined-terms checker. */
export function TermsIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M6 7H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V6a3 3 0 0 1-3 3" />
      <path d="M15 7h-2a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V6a3 3 0 0 1-3 3" />
      <path d="M20 15v2a1 1 0 0 1-1 1H5" />
    </svg>
  );
}

/** Clipboard with a check: the NDA triage 10-criteria screen. */
export function ChecklistIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="m8.5 12 2 2 3.5-3.5" />
    </svg>
  );
}

/** Broom: produce a clean copy (accept changes, strip comments). */
export function CleanIcon({ size = 15 }: P) {
  return (
    <svg {...base(size)} aria-hidden>
      <path d="M19 3 12 10" />
      <path d="M14 6.5 17.5 10" />
      <path d="M11 9 4 16c-1 1-1 3 0 4s3 1 4 0l7-7" />
      <path d="M6 21c0-2-1-3-3-3" />
    </svg>
  );
}
