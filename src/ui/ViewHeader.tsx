import type { ReactNode } from "react";
import { InfoTip } from "./InfoTip";

/**
 * The standard view header: an `h1.view-title`, an optional right-side control
 * (an InfoTip by default, or a custom `action`), and an optional muted subtitle.
 * Replaces the hand-rolled `row + view-title + InfoTip + p.small.muted` block
 * that was duplicated across ~24 views, keeping the spacing consistent.
 */
export function ViewHeader({
  title,
  info,
  infoSide,
  subtitle,
  action,
}: {
  title: string;
  /** InfoTip text (shown top-right) when no custom `action` is given. */
  info?: string;
  infoSide?: "left" | "right";
  subtitle?: ReactNode;
  /** A custom right-side control instead of the InfoTip. */
  action?: ReactNode;
}) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 className="view-title">{title}</h1>
        {action ?? (info ? <InfoTip text={info} side={infoSide} /> : null)}
      </div>
      {subtitle != null && subtitle !== "" && (
        <p className="small muted" style={{ margin: 0 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
