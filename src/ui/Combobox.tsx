import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronIcon, CheckIcon } from "./icons";
import { usePopover } from "./usePopover";
import "./combobox.css";

export interface ComboOption {
  value: string;
  label: string;
}

/**
 * Searchable single-select dropdown for long option lists (contract types,
 * jurisdictions) where a native `<select>` is a scroll-heavy chore. A trigger
 * shows the current label; opening reveals a filter input plus a listbox.
 *
 * Keyboard: type to filter, Up/Down to move the highlight, Enter to choose,
 * Escape to close. Closes on outside click or selection. Accepts `id` so it
 * associates with a `Field` label (the label's htmlFor targets the trigger).
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = "Select...",
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly ComboOption[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const style = usePopover(open, triggerRef, popRef, { align: "start", matchWidth: true });

  const current = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      // Popover is portaled outside the root, so check it too (else clicking the
      // search input or an option would count as "outside" and close it).
      if (!rootRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[active];
      if (o) choose(o.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="combobox" ref={rootRef}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className="combobox__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={current ? "" : "combobox__placeholder"}>
          {current ? current.label : placeholder}
        </span>
        <ChevronIcon size={15} />
      </button>
      {open &&
        createPortal(
          <div className="combobox__popover" ref={popRef} style={style}>
            <input
              ref={inputRef}
            className="combobox__search"
            type="text"
            value={query}
            placeholder="Search..."
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <ul className="combobox__list" id={listId} role="listbox">
            {filtered.length === 0 && <li className="combobox__empty">No matches</li>}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={`combobox__option${i === active ? " combobox__option--active" : ""}${
                  o.value === value ? " combobox__option--selected" : ""
                }`}
                onMouseEnter={() => setActive(i)}
                // mousedown (not click) + preventDefault so the option is chosen
                // before the input's blur can close the popover.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o.value);
                }}
              >
                <span className="combobox__option-label">{o.label}</span>
                {o.value === value && <CheckIcon size={13} />}
              </li>
            ))}
          </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
