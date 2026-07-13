import { useId, useState } from "react";
import { XIcon } from "@/ui/icons";
import { FileTypeIcon } from "@/ui/fileIcons";
import { Spinner, LiveRegion } from "@/ui/primitives";
import "./dropzone.css";

/** Local upload glyph (icons.tsx is a shared foundation file, so kept inline). */
function UploadGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M12 16V3M7 8l5-5 5 5" />
    </svg>
  );
}

/**
 * Modern tint-filled upload target: a clean surface (no dashed border) with a
 * small upload glyph, a black "Choose file" affordance, real drag-and-drop, and
 * a removable file chip once a file is picked. `busy` keeps the chip visible
 * beside a spinner while the caller processes the file. `disabled` renders the
 * surface inert (used by Transplant's "Describe the clause first." gate).
 */
export function Dropzone({
  accept,
  onFile,
  label,
  cta = "Choose file",
  hint,
  disabled = false,
  disabledHint,
  busy = false,
  busyLabel = "Working...",
}: {
  accept: string;
  onFile: (file: File) => void;
  label?: string;
  cta?: string;
  hint?: string;
  disabled?: boolean;
  disabledHint?: string;
  busy?: boolean;
  busyLabel?: string;
}) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  function choose(f: File) {
    setFile(f);
    onFile(f);
  }

  function clear() {
    setFile(null);
  }

  // Busy: the caller is processing the picked file. Keep the chip visible so the
  // user still sees what is being read, next to the progress spinner.
  if (busy) {
    return (
      <div className="dropzone dropzone--status">
        {file && (
          <div className="dropzone__chip">
            <FileTypeIcon name={file.name} size={18} />
            <span className="dropzone__chip-name small">{file.name}</span>
          </div>
        )}
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner />
          <LiveRegion>
            <span className="small muted">{busyLabel}</span>
          </LiveRegion>
        </div>
      </div>
    );
  }

  // A file is chosen but the caller is not processing it: show a removable chip.
  if (file) {
    return (
      <div className="dropzone dropzone--status">
        <div className="dropzone__chip">
          <FileTypeIcon name={file.name} size={18} />
          <span className="dropzone__chip-name small">{file.name}</span>
          <button
            type="button"
            className="dropzone__chip-x"
            aria-label="Remove file"
            title="Remove file"
            onClick={clear}
          >
            <XIcon size={13} />
          </button>
        </div>
      </div>
    );
  }

  const cls = [
    "dropzone",
    dragging && "dropzone--drag",
    disabled && "dropzone--disabled",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        if (f) choose(f);
      }}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        className="dropzone__input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) choose(f);
          e.target.value = "";
        }}
      />
      <span className="dropzone__glyph" aria-hidden>
        <UploadGlyph />
      </span>
      {label && <span className="dropzone__label small">{label}</span>}
      <label htmlFor={inputId} className="dropzone__cta">
        {cta}
      </label>
      <span className="small muted">{disabled ? disabledHint : hint}</span>
    </div>
  );
}
