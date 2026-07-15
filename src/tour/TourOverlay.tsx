import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { TourStep } from "./types";
import "./tour.css";

const HOLE_PAD = 6;
const TIP_MARGIN = 12;
const VIEWPORT_PAD = 8;
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
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipH, setTipH] = useState(0);

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
          // Bring the target into view so the spotlight lands on visible content,
          // then re-measure at its scrolled position.
          el.scrollIntoView({ block: "center", behavior: "auto" });
          setRect(el.getBoundingClientRect());
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

  // Measure the card's height so it can be clamped fully on-screen below.
  useLayoutEffect(() => {
    if (tipRef.current) setTipH(tipRef.current.offsetHeight);
  }, [index, rect, step.title, step.body]);

  const centered = !rect;

  const holeStyle = rect
    ? {
        top: rect.top - HOLE_PAD,
        left: rect.left - HOLE_PAD,
        width: rect.width + HOLE_PAD * 2,
        height: rect.height + HOLE_PAD * 2,
      }
    : undefined;

  // Position the card near the target but ALWAYS fully within the viewport, so
  // Next / Skip are never off-screen (which would trap the user behind the
  // backdrop). Prefer the requested side; fall back to whichever side fits.
  const vh = window.innerHeight;
  let top: number;
  if (!rect) {
    top = (vh - tipH) / 2;
  } else {
    const fitsBelow = rect.bottom + tipH + TIP_MARGIN <= vh - VIEWPORT_PAD;
    const fitsAbove = rect.top - tipH - TIP_MARGIN >= VIEWPORT_PAD;
    const placeBelow = step.placement === "top" ? !fitsAbove && fitsBelow : fitsBelow || !fitsAbove;
    top = placeBelow ? rect.bottom + TIP_MARGIN : rect.top - tipH - TIP_MARGIN;
  }
  top = Math.min(Math.max(VIEWPORT_PAD, top), Math.max(VIEWPORT_PAD, vh - tipH - VIEWPORT_PAD));
  const tipStyle: CSSProperties = { top };

  const last = index + 1 >= total;

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label={`${title} walkthrough`}>
      <div className={`tour-backdrop${centered ? " tour-backdrop--dim" : ""}`} />
      {rect && <div className="tour-hole" style={holeStyle} aria-hidden />}
      <div ref={tipRef} className={`tour-tip${centered ? " tour-tip--center" : ""}`} style={tipStyle}>
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
