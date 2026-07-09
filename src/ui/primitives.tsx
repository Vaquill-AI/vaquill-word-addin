import type { ButtonHTMLAttributes, ReactNode } from "react";
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

type Tone = "green" | "yellow" | "red" | "neutral" | "brand";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

type BannerTone = "info" | "warn" | "danger";

export function Banner({ tone = "info", children }: { tone?: BannerTone; children: ReactNode }) {
  return <div className={`banner banner--${tone}`}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
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
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={`seg__btn ${o.value === value ? "seg__btn--on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {typeof o.count === "number" && <span className="seg__count">{o.count}</span>}
        </button>
      ))}
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
