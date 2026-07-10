import { useEffect, useId, useRef, useState } from "react";
import { InfoIcon } from "./icons";
import "./infotip.css";

/**
 * An "i" button that reveals a short explanation on click. Used next to feature
 * titles so a dense legal plugin explains itself: what the feature does and what
 * to look out for. Click-to-toggle (works on touch), closes on outside-click or Escape.
 */
/**
 * `side` controls which way the popover opens, so it never clips off the pane:
 * "right" (default) for a tip sitting at the right edge of a row (opens leftward),
 * "left" for a tip next to a left-aligned title (opens rightward).
 */
export function InfoTip({
  text,
  label = "More information",
  side = "right",
}: {
  text: string;
  label?: string;
  side?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="infotip" ref={ref}>
      <button
        type="button"
        className={`infotip__btn ${open ? "infotip__btn--on" : ""}`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <InfoIcon size={14} />
      </button>
      {open && (
        <span id={popId} className={`infotip__pop infotip__pop--${side}`} role="note">
          {text}
        </span>
      )}
    </span>
  );
}
