import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

/**
 * Position a portaled popover relative to its trigger, clamped to the viewport.
 *
 * The task pane is narrow and its body scrolls, so an absolutely positioned
 * popover gets clipped by the scroll container and can run off the pane's right
 * edge or below the fold. The fix is to render the popover in a portal (to
 * `document.body`, escaping every `overflow` ancestor) and position it with
 * FIXED coordinates: below the trigger when there is room, flipped above when
 * there is not, and clamped horizontally so it always stays on screen.
 *
 * `align`: "end" lines the popover's right edge up with the trigger's right
 * (kebab menus, right-side info tips); "start" lines up the left edges.
 *
 * Returns a style object for the popover. It is `visibility: hidden` for the
 * first synchronous layout pass (so it can be measured without a flash), then
 * becomes visible once placed.
 */
export function usePopover(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  popRef: RefObject<HTMLElement | null>,
  opts: { align?: "start" | "end"; gap?: number; margin?: number; matchWidth?: boolean } = {},
): CSSProperties {
  const { align = "end", gap = 6, margin = 8, matchWidth = false } = opts;
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open) return;

    function place() {
      const trigger = triggerRef.current;
      const pop = popRef.current;
      if (!trigger || !pop) return;
      const t = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // When matching the trigger width (dropdowns), that is the popover width.
      const pw = matchWidth ? t.width : pop.offsetWidth;
      const ph = pop.offsetHeight;

      // Vertical: prefer below; flip above when there is more room there.
      const roomBelow = vh - t.bottom - gap - margin;
      const roomAbove = t.top - gap - margin;
      let top: number;
      let maxHeight: number;
      if (ph <= roomBelow || roomBelow >= roomAbove) {
        top = t.bottom + gap;
        maxHeight = Math.max(0, roomBelow);
      } else {
        maxHeight = Math.max(0, roomAbove);
        top = Math.max(margin, t.top - gap - Math.min(ph, maxHeight));
      }

      // Horizontal: align an edge to the trigger, then clamp inside the viewport.
      let left = align === "end" ? t.right - pw : t.left;
      left = Math.min(Math.max(margin, left), Math.max(margin, vw - pw - margin));

      const base: CSSProperties = {
        position: "fixed",
        top,
        left,
        maxHeight,
        overflowY: "auto",
        visibility: "visible",
      };
      setStyle(matchWidth ? { ...base, width: t.width } : base);
    }

    place();
    // Reposition on any scroll (capture, to catch inner scrollers) or resize.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, align, gap, margin, triggerRef, popRef]);

  return style;
}
