import type { ReactNode } from "react";
import "./toolcard.css";

/**
 * A quick-action tool card: icon + title + one-line plain-English description,
 * as a single tap target. Used for empty-state launchers and tool menus so a
 * first-time user understands each action without a tooltip.
 *
 * Stack several inside a `.stack` (or the `ToolCardList` wrapper) for the
 * "OTHER TOOLS" pattern.
 */
export interface ToolCardProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
}

export function ToolCard({ icon, title, description, onClick, disabled }: ToolCardProps) {
  return (
    <button type="button" className="toolcard" onClick={onClick} disabled={disabled}>
      {icon && (
        <span className="toolcard__icon" aria-hidden>
          {icon}
        </span>
      )}
      <span className="toolcard__body">
        <span className="toolcard__title">{title}</span>
        {description && <span className="toolcard__desc">{description}</span>}
      </span>
    </button>
  );
}

/** Vertical stack wrapper for a set of ToolCards. */
export function ToolCardList({ children }: { children: ReactNode }) {
  return <div className="toolcard-list">{children}</div>;
}
