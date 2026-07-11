import { useId, useState, type ReactNode } from "react";
import { ChevronIcon } from "./icons";
import { TONE_COLOR, type StatusTone } from "./status";
import "./status-group.css";

/**
 * A collapsible, status-tinted bucket for a group of results (e.g. all
 * "Non-compliant" items). Header shows a color dot, label, count, and a chevron;
 * the body is a vertical stack of the caller's children. Controlled-open via
 * internal state, exposed as a proper disclosure (`aria-expanded` / `aria-controls`).
 */
export function StatusGroup({
  tone,
  label,
  count,
  defaultOpen = true,
  children,
}: {
  tone: StatusTone;
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className="status-group">
      <button
        type="button"
        className="status-group__head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="status-group__dot" style={{ background: TONE_COLOR[tone] }} aria-hidden />
        <span className="status-group__label">{label}</span>
        <span className="status-group__count">{count}</span>
        <span className={`status-group__chev${open ? " status-group__chev--open" : ""}`} aria-hidden>
          <ChevronIcon size={14} />
        </span>
      </button>
      {open && (
        <div className="status-group__body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  );
}
