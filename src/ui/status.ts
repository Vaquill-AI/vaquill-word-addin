/**
 * Shared status tones for result-summary primitives (distribution bar, filter
 * chips, status groups). Maps a semantic tone to the theme's CSS custom
 * properties so every result surface (compliance, review, playbook run,
 * redaction) reads the same and stays theme-aware.
 */
export type StatusTone = "green" | "yellow" | "red" | "neutral" | "brand";

/** Solid fill for a tone (bar segments, group dots). */
export const TONE_COLOR: Record<StatusTone, string> = {
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  neutral: "var(--border-strong)",
  brand: "var(--brand)",
};

/** Soft tint for a tone (selected chips, subtle backgrounds). */
export const TONE_TINT: Record<StatusTone, string> = {
  green: "var(--green-tint)",
  yellow: "var(--yellow-tint)",
  red: "var(--red-tint)",
  neutral: "var(--surface-muted)",
  brand: "var(--brand-tint)",
};
