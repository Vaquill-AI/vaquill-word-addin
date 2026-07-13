/**
 * Shared string helpers. Consolidated here to remove the copies that had
 * accumulated across feature files (a `humanize` in six views, two near-identical
 * clause-type slug helpers).
 */

/** "limitation_of_liability" / "msa_vendor" -> "Limitation Of Liability". */
export function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Normalize a free-text clause name into a snake_case clause-type key
 * ("Limitation of Liability" -> "limitation_of_liability"). Starts with a letter
 * (the backend clause-type CHECK requires `^[a-z]`) and is capped so it never
 * overflows the column. Returns `fallback` when nothing usable remains.
 */
export function toClauseTypeKey(name: string, fallback = "general"): string {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/g, "")
    .slice(0, 64);
  return key || fallback;
}
