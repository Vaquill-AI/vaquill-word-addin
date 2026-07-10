import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement, useId, useRef } from "react";
import "./ui.css";

type ButtonVariant = "default" | "primary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  block?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "default",
  size = "md",
  block,
  loading,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  const cls = [
    "btn",
    variant === "primary" && "btn--primary",
    variant === "ghost" && "btn--ghost",
    size === "sm" && "btn--sm",
    block && "btn--block",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

/**
 * Announces dynamic status (streaming progress, transient confirmations) to
 * assistive tech. Wrap any live status text so screen-reader users hear the
 * operations the pane is running. Visually transparent - it only adds semantics.
 */
export function LiveRegion({
  children,
  assertive,
  className,
}: {
  children: ReactNode;
  assertive?: boolean;
  className?: string;
}) {
  return (
    <div role="status" aria-live={assertive ? "assertive" : "polite"} className={className}>
      {children}
    </div>
  );
}

type Tone = "green" | "yellow" | "red" | "neutral" | "brand";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

type BannerTone = "info" | "warn" | "danger";

export function Banner({ tone = "info", children }: { tone?: BannerTone; children: ReactNode }) {
  // Errors must reach assistive tech the moment they appear after an async action.
  const role = tone === "danger" ? "alert" : undefined;
  return (
    <div className={`banner banner--${tone}`} role={role}>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  // Associate the visible label with its control so clicking the label focuses
  // it and screen readers announce a name (the child gets the generated id).
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {child}
    </div>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Roving arrow-key navigation between segments (APG tablist behavior), so the
  // control feels like a native Word tab group rather than a row of buttons.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    let next = i;
    if (e.key === "ArrowLeft") next = (i - 1 + options.length) % options.length;
    if (e.key === "ArrowRight") next = (i + 1) % options.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = options.length - 1;
    onChange(options[next].value);
    const btns = ref.current?.querySelectorAll<HTMLButtonElement>(".seg__btn");
    btns?.[next]?.focus();
  }

  return (
    <div className="seg" role="tablist" aria-label={label} ref={ref} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={`seg__btn ${on ? "seg__btn--on" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
            {typeof o.count === "number" && <span className="seg__count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  tone = "default",
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "default" | "green" | "red";
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`iconbtn iconbtn--${tone} ${active ? "iconbtn--active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
