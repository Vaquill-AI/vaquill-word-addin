import type { ContractReviewResponse } from "@/api/types";

/**
 * Persist the last contract review INSIDE the .docx (custom XML part), so
 * reopening a reviewed contract - even after it was emailed out and back -
 * rehydrates the review without re-running the paid AI pass or a server lookup.
 * In-document analysis state is the biggest under-exploited moat: competitors
 * key it server-side by a fragile doc identity that breaks on Save As / email.
 */
export const REVIEW_NS = "https://vaquill.ai/review/1";

export interface ReviewSnapshot {
  savedAt: string;
  result: ContractReviewResponse;
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
