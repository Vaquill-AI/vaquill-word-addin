import type { ReactNode } from "react";
import { InfoTip } from "./InfoTip";
import { RescanButton } from "./RescanButton";
import { TourButton } from "@/tour/TourButton";

/**
 * The standard view header: an `h1.view-title`, an optional right-side control
 * (an InfoTip by default, or a custom `action`), an optional "Tour" launcher, a
 * shared "Rescan" button for document-analysis tools, and an optional muted
 * subtitle. Replaces the hand-rolled `row + view-title + InfoTip + p.small.muted`
 * block duplicated across ~24 views.
 */
export function ViewHeader({
  title,
  info,
  infoSide,
  subtitle,
  action,
  tourId,
  onRescan,
  rescanning,
}: {
  title: string;
  /** InfoTip text (shown top-right) when no custom `action` is given. */
  info?: string;
  infoSide?: "left" | "right";
  subtitle?: ReactNode;
  /** A custom right-side control instead of the InfoTip. */
  action?: ReactNode;
  /** When set, a small "Tour" launcher for this guide sits alongside the info. */
  tourId?: string;
  /** When set, a shared "Rescan" button re-reads the document and refreshes the
   *  tool's findings. Wire it to the view's reload function. */
  onRescan?: () => void;
  /** True while a rescan is in flight (spinner + disabled). */
  rescanning?: boolean;
}) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 className="view-title">{title}</h1>
        <div className="row" style={{ gap: 8, alignItems: "center", flex: "none" }}>
          {onRescan && <RescanButton onClick={onRescan} busy={rescanning} />}
          {tourId && <TourButton tourId={tourId} label="Tour" />}
          {action ?? (info ? <InfoTip text={info} side={infoSide} /> : null)}
        </div>
      </div>
      {subtitle != null && subtitle !== "" && (
        <p className="small muted" style={{ margin: 0 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
