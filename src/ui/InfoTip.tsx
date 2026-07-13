import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InfoIcon } from "./icons";
import { usePopover } from "./usePopover";
import "./infotip.css";

/**
 * An "i" button that reveals a short explanation on click. Used next to feature
 * titles so a dense legal plugin explains itself: what the feature does and what
 * to look out for. Click-to-toggle (works on touch), closes on outside-click or Escape.
 *
 * The popover is portaled and viewport-clamped (see usePopover) so it never
 * clips off the narrow pane. `side` only sets which edge aligns to the button:
 * "right" (default) for a tip at the right of a row, "left" next to a left title.
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const popId = useId();
  const style = usePopover(open, btnRef, popRef, { align: side === "right" ? "end" : "start" });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      // The popover is portaled outside the button, so check it explicitly.
      if (!btnRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false);
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
    <span className="infotip">
      <button
        type="button"
        ref={btnRef}
        className={`infotip__btn ${open ? "infotip__btn--on" : ""}`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <InfoIcon size={14} />
      </button>
      {open &&
        createPortal(
          <span id={popId} ref={popRef} className="infotip__pop" role="note" style={style}>
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
