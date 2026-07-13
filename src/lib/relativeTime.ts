/**
 * A compact, human relative time ("just now", "5m ago", "3d ago"), falling back
 * to a locale date beyond a week. Used for comment + reply timestamps.
 */
export function formatRelativeTime(input?: string | number | null): string | null {
  if (input === undefined || input === null || input === "") return null;
  const ms = typeof input === "number" ? input : new Date(input).getTime();
  if (Number.isNaN(ms)) return null;

  const diff = Date.now() - ms;
  // A small negative skew (clock differences) reads as "just now", not the future.
  if (diff < 60000) return "just now";
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

/** A full, exact timestamp for a tooltip on the relative label. */
export function formatExactTime(input?: string | number | null): string | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  const ms = typeof input === "number" ? input : new Date(input).getTime();
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toLocaleString();
}
