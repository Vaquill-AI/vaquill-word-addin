import { runWord } from "./run";

/**
 * Per-clause NEGOTIATION status, stored as its own custom XML part inside the
 * .docx (separate from the review snapshot, so it never touches the review flow).
 * Because it lives in the document, the negotiation state travels with the file
 * as it is emailed out and back across rounds - a lightweight negotiation ledger
 * with no backend and no matter required. Keyed by the same stable redline
 * identity the review uses, so status lines up with the reviewed clauses.
 *
 * This is the client-only seed of the deal cockpit. A fuller version persists the
 * ledger per matter server-side (rounds, concession history, counterparty
 * profile), which this cannot do from a single document.
 */
export const NEGOTIATION_NS = "https://vaquill.ai/negotiation/1";

export type ClauseStatus = "open" | "agreed" | "conceded" | "rejected";

export interface NegotiationState {
  savedAt: string;
  /** redlineKey (clauseName|currentLanguage prefix) -> status. */
  status: Record<string, ClauseStatus>;
}

const VALID: ReadonlySet<string> = new Set(["open", "agreed", "conceded", "rejected"]);

function toBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
function fromBase64(b64: string): string {
  return decodeURIComponent(escape(atob(b64)));
}

function toXml(state: NegotiationState): string {
  return `<n xmlns="${NEGOTIATION_NS}" v="1">${toBase64(JSON.stringify(state))}</n>`;
}

function fromXml(xml: string): NegotiationState | null {
  try {
    // Word can re-serialize a custom XML part with a namespace prefix on reopen
    // (e.g. <ns0:n ...>...</ns0:n>), so tolerate an optional prefix on the close.
    const m = />([A-Za-z0-9+/=\s]*)<\/(?:[A-Za-z0-9_.-]+:)?n>/.exec(xml);
    const payload = m?.[1]?.trim();
    if (!payload) return null;
    const parsed = JSON.parse(fromBase64(payload)) as NegotiationState;
    if (!parsed || typeof parsed.status !== "object") return null;
    const clean: Record<string, ClauseStatus> = {};
    for (const [k, v] of Object.entries(parsed.status)) {
      if (typeof v === "string" && VALID.has(v)) clean[k] = v as ClauseStatus;
    }
    return { savedAt: String(parsed.savedAt ?? ""), status: clean };
  } catch {
    return null;
  }
}

export async function readNegotiationState(): Promise<NegotiationState | null> {
  return runWord(async (context) => {
    const parts = context.document.customXmlParts.getByNamespace(NEGOTIATION_NS);
    parts.load("items");
    await context.sync();
    if (parts.items.length === 0) return null;
    const xml = parts.items[0].getXml();
    await context.sync();
    return fromXml(xml.value);
  });
}

export async function writeNegotiationState(state: NegotiationState): Promise<void> {
  return runWord(async (context) => {
    const parts = context.document.customXmlParts.getByNamespace(NEGOTIATION_NS);
    parts.load("items");
    await context.sync();
    for (const part of parts.items) part.delete();
    await context.sync();
    context.document.customXmlParts.add(toXml(state));
    await context.sync();
  });
}
