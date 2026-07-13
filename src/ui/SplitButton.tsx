import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./primitives";
import type { OverflowMenuItem } from "./OverflowMenu";
import { usePopover } from "./usePopover";
import "./split-button.css";

function CaretIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * A split primary button: a main action plus a connected caret that opens a small
 * menu of alternate modes (e.g. "Apply as tracked change" + "Apply clean"). The
 * caret is `aria-haspopup="menu"` / `aria-expanded`; the menu is `role="menu"`
 * with `role="menuitem"` buttons. Escape and click-outside close it (Escape
 * returns focus to the caret). Menu items reuse the OverflowMenuItem shape.
 */
export function SplitButton({
  label,
  icon,
  onClick,
  loading,
  disabled,
  items,
  menuLabel,
}: {
  label: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  items: OverflowMenuItem[];
  menuLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const style = usePopover(open, rootRef, menuRef, { align: "end", gap: 4 });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // Menu is portaled outside the root; check it too so a mousedown on an item
      // does not close before its click fires.
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>(".split-btn__caret")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="split-btn" ref={rootRef}>
      <Button
        variant="primary"
        size="sm"
        className="split-btn__primary"
        onClick={onClick}
        loading={loading}
        disabled={disabled}
      >
        {icon}
        {label}
      </Button>
      <Button
        variant="primary"
        size="sm"
        className="split-btn__caret"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={menuLabel}
        disabled={disabled || loading}
        onClick={() => setOpen((v) => !v)}
      >
        <CaretIcon />
      </Button>
      {open &&
        createPortal(
          <div className="split-btn__menu" id={menuId} role="menu" ref={menuRef} style={style}>
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`split-btn__item${item.tone === "danger" ? " split-btn__item--danger" : ""}`}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
