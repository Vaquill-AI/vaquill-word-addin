/**
 * Governance ledger: the sign-off record stored INSIDE the .docx (custom XML
 * part). It travels with the file, so anyone who opens the document, even after
 * it was emailed out and back, sees whether it still needs manager/partner/GC
 * sign-off. This is the F2 moat: governance that lives in the file, not a server
 * record you lose when the file leaves the platform.
 *
 * Integrity is tamper-EVIDENT, not tamper-proof: a SHA-256 over the canonical
 * payload flags hand-edits to the embedded XML. A determined user can strip the
 * part entirely or recompute the hash; true tamper-proofing needs server-side
 * signing (future). The UI states this honestly.
 */

export const GOVERNANCE_NS = "https://vaquill.ai/governance/1";

export type GovernanceStatus = "cleared" | "pending_signoff" | "signed_off";
export type SignoffLevel = "manager" | "partner" | "gc";

export interface GovernanceEvent {
  at: string;
  actor: string;
  action: "review_recorded" | "signed_off" | "reopened";
  note?: string;
}

export interface GovernanceReason {
  clauseName?: string;
  reason?: string;
}

export interface GovernanceLedger {
  version: 1;
  status: GovernanceStatus;
  requiredLevel: SignoffLevel | null;
  dealBreakerCount: number;
  summary: string;
  reasons: GovernanceReason[];
  contractType?: string;
  playbookId?: string;
  matterId?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  signedOffBy?: string;
  signedOffAt?: string;
  events: GovernanceEvent[];
  integrity?: string;
}

export interface ReviewMeta {
  contractType?: string;
  playbookId?: string;
  matterId?: string;
}

// A minimal shape mirroring the backend ReviewApprovalGate.
export interface GateLike {
  required: boolean;
  level?: SignoffLevel | null;
  dealBreakerCount: number;
  summary: string;
  reasons: GovernanceReason[];
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---- Integrity (SHA-256 over a stable serialization) ----

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  // Skip undefined values so the hash matches after a JSON round-trip (JSON
  // drops undefined-valued keys; the stored ledger will not have them).
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeIntegrity(ledger: GovernanceLedger): Promise<string> {
  const { integrity: _omit, ...rest } = ledger;
  return sha256Hex(stableStringify(rest));
}

export type IntegrityState = "verified" | "modified" | "unknown";

/**
 * Tri-state integrity check. A ledger with no stored signature (older build, or
 * a part that never carried a hash) is "unknown", NOT "modified": absence of a
 * signature is not evidence of tampering, and flagging it as tampered cries wolf.
 */
export async function checkIntegrity(ledger: GovernanceLedger): Promise<IntegrityState> {
  if (!ledger.integrity) return "unknown";
  return (await computeIntegrity(ledger)) === ledger.integrity ? "verified" : "modified";
}

// ---- Build / mutate ----

export async function buildLedgerFromGate(
  gate: GateLike,
  meta: ReviewMeta,
  actor: string,
): Promise<GovernanceLedger> {
  const at = nowIso();
  const status: GovernanceStatus = gate.required ? "pending_signoff" : "cleared";
  const ledger: GovernanceLedger = {
    version: 1,
    status,
    requiredLevel: gate.required ? gate.level ?? null : null,
    dealBreakerCount: gate.dealBreakerCount,
    summary: gate.summary,
    reasons: gate.reasons ?? [],
    contractType: meta.contractType,
    playbookId: meta.playbookId,
    matterId: meta.matterId,
    reviewedAt: at,
    reviewedBy: actor,
    events: [
      {
        at,
        actor,
        action: "review_recorded",
        note: gate.required
          ? `${gate.level ?? "sign-off"} sign-off required`
          : "No sign-off required",
      },
    ],
  };
  ledger.integrity = await computeIntegrity(ledger);
  return ledger;
}

export async function applySignoff(
  ledger: GovernanceLedger,
  actor: string,
  note?: string,
): Promise<GovernanceLedger> {
  const at = nowIso();
  const next: GovernanceLedger = {
    ...ledger,
    status: "signed_off",
    signedOffBy: actor,
    signedOffAt: at,
    events: [...ledger.events, { at, actor, action: "signed_off", note }],
  };
  next.integrity = await computeIntegrity(next);
  return next;
}

// ---- XML (base64 payload avoids any XML-escaping concerns) ----

function toBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
function fromBase64(b64: string): string {
  return decodeURIComponent(escape(atob(b64)));
}

export function ledgerToXml(ledger: GovernanceLedger): string {
  return `<g xmlns="${GOVERNANCE_NS}" v="1">${toBase64(JSON.stringify(ledger))}</g>`;
}

export function ledgerFromXml(xml: string): GovernanceLedger | null {
  try {
    // Our part is <g ...>BASE64</g>, but Word may re-serialize with a namespace
    // prefix on reopen (<ns0:g ...>BASE64</ns0:g>), so tolerate an optional
    // prefix on the closing tag rather than hard-coding the bare </g>.
    const m = />([A-Za-z0-9+/=\s]*)<\/(?:[A-Za-z0-9_.-]+:)?g>/.exec(xml);
    const payload = m?.[1]?.trim();
    if (!payload) return null;
    return JSON.parse(fromBase64(payload)) as GovernanceLedger;
  } catch {
    return null;
  }
}
