/**
 * Official-brand file-type icons, ported from the main app's single source of
 * truth (`components/documents/file-type-icons.tsx`) so the add-in renders the
 * SAME logos as the web product instead of generic monochrome marks.
 *
 * Each icon is one document silhouette (white page + folded corner) with a
 * brand-colored badge carrying the official letter/label, matching the
 * Microsoft 365 / Adobe Acrobat file-icon system. Brand colors are the official
 * ones (Word #2B579A, Excel #217346, PowerPoint #C43E1C, Acrobat/PDF #E5252A).
 * Self-contained inline SVG (no external assets), sized via a `size` prop to
 * match the add-in's icon convention.
 *
 * Word and PDF use the exact rich artwork the web app's navbar renders (the
 * vscode-icons glyphs, see fileIconAssets.ts); the remaining kinds use the
 * badge frame below.
 */
import { WORD_ICON_BODY, PDF_ICON_BODY } from "./fileIconAssets";

type FileIconProps = { size?: number; className?: string };

/** Render a rich 32x32 vscode-icons glyph body inside an <svg>. */
function RichGlyph({ size = 16, className, body }: FileIconProps & { body: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

const PAGE_FILL = "#FFFFFF";
const PAGE_STROKE = "#CBD5E1";
const FOLD_FILL = "#E2E8F0";

// Document silhouette (x 4..20, y 2..22) with a folded top-right corner.
const PAGE_PATH =
  "M6 2h7.172a2 2 0 0 1 1.414.586l4.828 4.828A2 2 0 0 1 20 8.828V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z";
const FOLD_PATH = "M13.5 2.2V6.5a2 2 0 0 0 2 2h4.3L13.5 2.2Z";

/**
 * Shared frame: white page + fold, then a brand badge carrying a short label
 * (W / PDF / TXT ...). Kept internal; the exported per-type wrappers are the
 * public, reusable components.
 */
function FileGlyph({
  size = 16,
  className,
  accent,
  label,
}: FileIconProps & { accent: string; label: string }) {
  // Smaller type for multi-character labels so "PDF"/"TXT" stay inside the badge.
  const fontSize = label.length >= 3 ? 4.2 : label.length === 2 ? 5.6 : 7;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d={PAGE_PATH} fill={PAGE_FILL} stroke={PAGE_STROKE} strokeWidth="1" />
      <path d="M13.5 8.5h6.3L13.5 2.2v6.3Z" fill="#000000" opacity="0.06" />
      <path
        d={FOLD_PATH}
        fill={FOLD_FILL}
        stroke={PAGE_STROKE}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Faint content lines so the page reads as a real document. */}
      <g fill="#E2E8F0">
        <rect x="7.4" y="9.4" width="9.2" height="1.15" rx="0.57" />
        <rect x="7.4" y="11.7" width="9.2" height="1.15" rx="0.57" />
      </g>
      {/* Brand badge overlapping the page's lower-left, with a subtle sheen. */}
      <rect x="1.5" y="12" width="12.2" height="9.7" rx="2.3" fill={accent} />
      <rect x="1.5" y="12" width="12.2" height="4.85" rx="2.3" fill="#FFFFFF" opacity="0.16" />
      <text
        x="7.6"
        y={16.85 + fontSize * 0.34}
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize={fontSize}
        fontWeight="700"
        letterSpacing={label.length >= 3 ? "-0.2" : "0"}
        fontFamily="'Segoe UI', system-ui, -apple-system, sans-serif"
      >
        {label}
      </text>
    </svg>
  );
}

/** Adobe Acrobat / PDF - the rich official glyph (same as the web app). */
export function PdfIcon(props: FileIconProps) {
  return <RichGlyph body={PDF_ICON_BODY} {...props} />;
}

/** Microsoft Word - the rich official glyph (same as the web navbar). */
export function WordIcon(props: FileIconProps) {
  return <RichGlyph body={WORD_ICON_BODY} {...props} />;
}

/** Plain text - slate badge, "TXT". */
export function TextIcon(props: FileIconProps) {
  return <FileGlyph accent="#64748B" label="TXT" {...props} />;
}

/** Generic / unknown file - neutral page with faint content lines. */
export function GenericFileIcon({ size = 16, className }: FileIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d={PAGE_PATH} fill={PAGE_FILL} stroke={PAGE_STROKE} strokeWidth="1" />
      <path
        d={FOLD_PATH}
        fill={FOLD_FILL}
        stroke={PAGE_STROKE}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <rect x="7" y="12.5" width="10" height="1.4" rx="0.7" fill="#94A3B8" />
      <rect x="7" y="15.4" width="10" height="1.4" rx="0.7" fill="#94A3B8" />
      <rect x="7" y="18.3" width="6.5" height="1.4" rx="0.7" fill="#94A3B8" />
    </svg>
  );
}

/**
 * Map a filename (or bare extension) to its brand icon. Mirrors the web app's
 * `getFileIcon` so a `.docx` looks identical in the add-in and the product.
 */
export function FileTypeIcon({
  name,
  size = 16,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : name.toLowerCase();
  if (ext === "pdf") return <PdfIcon size={size} className={className} />;
  if (ext === "doc" || ext === "docx" || ext === "rtf") return <WordIcon size={size} className={className} />;
  if (ext === "txt" || ext === "md" || ext === "text") return <TextIcon size={size} className={className} />;
  return <GenericFileIcon size={size} className={className} />;
}
