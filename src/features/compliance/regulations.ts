/**
 * US-relevant regulations the whole-document compliance check supports. Values
 * are the backend `RegulationType` enum values consumed by
 * POST /api/v1/legal-tools/compliance-check. Keep this list a subset of the
 * backend SUPPORTED_REGULATIONS so we never send one the server rejects (400).
 */
export interface RegulationOption {
  value: string;
  label: string;
  /** One-line, lawyer-plain description shown under the picker. */
  blurb: string;
}

export const REGULATIONS: RegulationOption[] = [
  { value: "ccpa", label: "CCPA / CPRA", blurb: "California consumer privacy: notice, opt-out, and data-rights obligations." },
  { value: "hipaa", label: "HIPAA", blurb: "Protected health information: safeguards, BAAs, and breach handling." },
  { value: "glba", label: "GLBA", blurb: "Financial privacy: safeguards rule and consumer financial data handling." },
  { value: "ferpa", label: "FERPA", blurb: "Student education records: access, disclosure, and consent rules." },
  { value: "tcpa", label: "TCPA", blurb: "Telemarketing and SMS: consent, opt-out, and contact restrictions." },
  { value: "sox", label: "SOX", blurb: "Financial reporting and internal-control obligations." },
  { value: "pci_dss", label: "PCI DSS", blurb: "Payment-card data: storage, transmission, and security controls." },
  { value: "soc2", label: "SOC 2", blurb: "Security, availability, and confidentiality trust-service criteria." },
  { value: "gdpr", label: "GDPR", blurb: "EU data protection: lawful basis, data-subject rights, transfers." },
];

export function regulationLabel(value: string): string {
  return REGULATIONS.find((r) => r.value === value)?.label ?? value.toUpperCase();
}

/**
 * Distinctive vocabulary per regulation, for a fast client-side "which regulation
 * is this document about" heuristic. `strong` phrases are near-unambiguous when
 * present (2 pts); `weak` single terms are supporting signals (1 pt). Regulations
 * have such distinct language (PHI vs cardholder data vs education records) that a
 * keyword pass is enough to pick a smart default the user can still change - no
 * LLM call needed here (unlike contract-type detection).
 */
const REGULATION_SIGNALS: { value: string; strong: string[]; weak: string[] }[] = [
  {
    value: "hipaa",
    strong: ["protected health information", "business associate", "covered entity", "hipaa"],
    weak: ["phi", "health information", "medical record"],
  },
  {
    value: "pci_dss",
    strong: ["cardholder data", "primary account number", "pci dss", "pci-dss"],
    weak: ["cardholder", "payment card", "card data"],
  },
  {
    value: "ccpa",
    strong: ["california consumer privacy", "ccpa", "cpra", "california resident", "do not sell my"],
    weak: ["california consumer", "right to opt out"],
  },
  {
    value: "gdpr",
    strong: [
      "general data protection regulation",
      "gdpr",
      "data subject",
      "lawful basis",
      "data protection officer",
      "supervisory authority",
    ],
    weak: ["personal data", "european union"],
  },
  {
    value: "ferpa",
    strong: ["education record", "ferpa", "eligible student", "directory information"],
    weak: ["student record"],
  },
  {
    value: "tcpa",
    strong: [
      "telephone consumer protection act",
      "tcpa",
      "prior express written consent",
      "autodialer",
      "telemarketing",
    ],
    weak: ["sms", "text message", "robocall"],
  },
  {
    value: "glba",
    strong: ["gramm-leach-bliley", "glba", "nonpublic personal information", "safeguards rule"],
    weak: ["financial institution"],
  },
  {
    value: "sox",
    strong: [
      "sarbanes-oxley",
      "sarbanes oxley",
      "internal control over financial reporting",
      "section 404",
    ],
    weak: ["audit committee", "financial reporting"],
  },
  {
    value: "soc2",
    strong: ["soc 2", "soc2", "trust service criteria", "service organization control"],
    weak: [],
  },
];

/**
 * Best-guess the relevant regulation from document text. Returns a regulation
 * value only when a distinctive signal is present AND there is a clear leader,
 * so an ambiguous document yields null and the caller keeps its default rather
 * than pre-selecting the wrong regulation.
 */
export function suggestRegulation(text: string): string | null {
  const hay = (text || "").toLowerCase();
  let best: { value: string; score: number } | null = null;
  let second = 0;
  for (const sig of REGULATION_SIGNALS) {
    let score = 0;
    for (const s of sig.strong) if (hay.includes(s)) score += 2;
    for (const w of sig.weak) if (hay.includes(w)) score += 1;
    if (!best || score > best.score) {
      second = best?.score ?? 0;
      best = { value: sig.value, score };
    } else if (score > second) {
      second = score;
    }
  }
  // Confident only: at least one distinctive signal, and a clear lead.
  if (best && best.score >= 2 && best.score > second) return best.value;
  return null;
}
