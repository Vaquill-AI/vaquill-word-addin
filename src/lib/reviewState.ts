import type { ContractReviewResponse } from "@/api/types";

/**
 * Persist the last contract review INSIDE the .docx (custom XML part), so
 * reopening a reviewed contract - even after it was emailed out and back -
 * rehydrates the review without re-running the paid AI pass or a server lookup.
 * Storing the analysis state in the document, rather than server-side keyed by a
 * document identity that breaks on Save As or email, means it survives the file
 * leaving and coming back.
 */
export const REVIEW_NS = "https://vaquill.ai/review/1";

export interface ReviewSnapshot {
  savedAt: string;
  result: ContractReviewResponse;
  /** SHA-256 of the document body at review time, so a later open can tell
   * whether the draft changed since. Absent on snapshots from older builds. */
  docHash?: string;
  /** Per-redline accept/reject decisions, keyed by a STABLE redline identity
   * (clauseName + current language), so reopening a reviewed file restores the
   * reviewer's progress instead of resetting every redline to pending. Index
   * keys would break if a re-run reorders redlines. Absent on older snapshots. */
  decisions?: Record<string, "pending" | "accepted" | "rejected">;
}

function toBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
function fromBase64(b64: string): string {
  return decodeURIComponent(escape(atob(b64)));
}

export function snapshotToXml(s: ReviewSnapshot): string {
  return `<r xmlns="${REVIEW_NS}" v="1">${toBase64(JSON.stringify(s))}</r>`;
}

export function snapshotFromXml(xml: string): ReviewSnapshot | null {
  try {
    // Word can re-serialize a custom XML part with a namespace prefix on
    // reopen (e.g. <ns0:r ...>BASE64</ns0:r>), so tolerate an optional prefix
    // on the closing tag rather than hard-coding the bare </r>.
    const m = />([A-Za-z0-9+/=\s]*)<\/(?:[A-Za-z0-9_.-]+:)?r>/.exec(xml);
    const payload = m?.[1]?.trim();
    if (!payload) return null;
    const parsed = JSON.parse(fromBase64(payload)) as ReviewSnapshot;
    return parsed.result ? parsed : null;
  } catch {
    return null;
  }
}
