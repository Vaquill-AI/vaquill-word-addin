import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { TourStep } from "./types";
import "./tour.css";

const HOLE_PAD = 6;
// Rough tooltip height used only to decide above/below placement.
const TIP_ROOM = 180;
const MAX_MEASURE_TRIES = 24;

/**
 * Renders the current tour step: a dimming backdrop, a spotlight cut out over the
 * target element, and a tooltip card with the copy + Back / Next / Skip. When the
 * target is missing (a whole-surface step, or a view still mounting after a nav)
 * it falls back to a centered card. Portaled to <body> so it sits above the pane.
 */
export function TourOverlay({
  step,
  title,
  index,
  total,
  onNext,
  onPrev,
  onClose,
}: {
  step: TourStep;
  title: string;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Locate + measure the target. After a nav the view may still be mounting, so
  // retry across a few frames before giving up and centering the card.
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    let cancelled = false;

    const find = () =>
      step.target ? (document.querySelector(step.target) as HTMLElement | null) : null;

    const attempt = () => {
      if (cancelled) return;
      const el = find();
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) {
          setRect(r);
          return;
        }
      }
      if (step.target && tries++ < MAX_MEASURE_TRIES) {
        raf = requestAnimationFrame(attempt);
        return;
      }
      setRect(null);
    };

    const remeasure = () => {
      const el = find();
      setRect(el ? el.getBoundingClientRect() : null);
    };

    setRect(null);
    raf = requestAnimationFrame(attempt);
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [index, step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter" || e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft") onPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onPrev]);

  const centered = !rect;
  const preferBelow = step.placement !== "top";
  const roomBelow = rect ? rect.bottom + TIP_ROOM < window.innerHeight : false;
  const below = rect ? (preferBelow ? roomBelow || rect.top < TIP_ROOM : !(rect.top > TIP_ROOM)) : false;

  const holeStyle = rect
    ? {
        top: rect.top - HOLE_PAD,
        left: rect.left - HOLE_PAD,
        width: rect.width + HOLE_PAD * 2,
        height: rect.height + HOLE_PAD * 2,
      }
    : undefined;

  const tipStyle: CSSProperties = rect
    ? below
      ? { top: rect.bottom + 12 }
      : { bottom: window.innerHeight - rect.top + 12 }
    : {};

  const last = index + 1 >= total;

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label={`${title} walkthrough`}>
      <div className={`tour-backdrop${centered ? " tour-backdrop--dim" : ""}`} />
      {rect && <div className="tour-hole" style={holeStyle} aria-hidden />}
      <div className={`tour-tip${centered ? " tour-tip--center" : ""}`} style={tipStyle}>
        <div className="tour-tip__head">
          <span className="tour-tip__count small muted">
            {index + 1} / {total}
          </span>
          <button type="button" className="tour-tip__skip small muted" onClick={onClose}>
            Skip
          </button>
        </div>
        <h3 className="tour-tip__title">{step.title}</h3>
        <p className="tour-tip__body small">{step.body}</p>
        <div className="tour-tip__actions">
          {index > 0 && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onPrev}>
              Back
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary btn--sm"
            style={{ marginLeft: "auto" }}
            onClick={onNext}
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
