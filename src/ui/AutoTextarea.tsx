import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties, TextareaHTMLAttributes } from "react";

interface AutoTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Max height in px before the textarea scrolls instead of growing. */
  maxHeight?: number;
}

/**
 * A textarea that grows with its content up to `maxHeight`, then scrolls, so a
 * long prompt / instruction is never clipped. Drop-in replacement for a plain
 * `<textarea>` -- used EVERYWHERE a user writes free text (composer, draft brief,
 * edit/review instructions, prompt library, comments, notes). Keeps the value
 * controlled by the caller; it just manages its own height.
 */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, AutoTextareaProps>(
  function AutoTextarea({ maxHeight = 200, value, style, ...props }, ref) {
    const inner = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement, []);

    useEffect(() => {
      const ta = inner.current;
      if (!ta) return;
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
    }, [value, maxHeight]);

    const merged: CSSProperties = {
      maxHeight,
      overflowY: "auto",
      resize: "none",
      ...style,
    };
    return <textarea ref={inner} value={value} style={merged} {...props} />;
  },
);
