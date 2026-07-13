import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopover } from "./usePopover";
import "./overflow-menu.css";

/** Vertical three-dots (kebab) glyph. Kept local so the shared icon set stays lean. */
function KebabGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
    >
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

export interface OverflowMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
}

/**
 * Accessible kebab (overflow) menu. A trigger button toggles a popover list of
 * actions. Follows the APG menu-button pattern: opens on click, focuses the
 * first item, closes on Escape / click-outside / selection, and returns focus
 * to the trigger when closed by keyboard or selection. Purely additive - it
 * declutters an action row by hiding secondary actions behind one control.
 */
export function OverflowMenu({
  items,
  label,
}: {
  items: OverflowMenuItem[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const style = usePopover(open, triggerRef, menuRef, { align: "end", gap: 4 });

  // Focus the first item when the menu opens (APG: menu button moves focus in).
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  // Close on click-outside. Focus naturally follows the click, so we do not
  // force it back to the trigger here.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      // The menu is portaled outside the root, so a mousedown on a menu item is
      // "outside" the root; check the menu too, or the click-to-close would fire
      // before the item's onClick and swallow the selection.
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function closeToTrigger() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeToTrigger();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (nodes.length === 0) return;
    const active = document.activeElement;
    const current = nodes.findIndex((n) => n === active);
    let next = current;
    if (e.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % nodes.length;
    if (e.key === "ArrowUp") next = current <= 0 ? nodes.length - 1 : current - 1;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = nodes.length - 1;
    nodes[next]?.focus();
  }

  function select(item: OverflowMenuItem) {
    // Close first so focus returns to the trigger, then run the action.
    closeToTrigger();
    item.onSelect();
  }

  return (
    <div className="ovm" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`iconbtn iconbtn--default ovm__trigger${open ? " ovm__trigger--on" : ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <KebabGlyph size={16} />
      </button>

      {open &&
        createPortal(
          <div
            className="ovm__menu"
            id={menuId}
            role="menu"
            aria-label={label}
            ref={menuRef}
            onKeyDown={onMenuKeyDown}
            style={style}
          >
            {items.map((item, i) => (
            <button
              type="button"
              // Labels are the stable identity of a static action list here.
              key={`${item.label}-${i}`}
              role="menuitem"
              tabIndex={-1}
              className={`ovm__item${item.tone === "danger" ? " ovm__item--danger" : ""}`}
              onClick={() => select(item)}
            >
              {item.icon && <span className="ovm__item-icon">{item.icon}</span>}
              <span className="ovm__item-label">{item.label}</span>
            </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
