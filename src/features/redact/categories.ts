/**
 * Redaction categories. The first group is detected by deterministic regex
 * patterns, ordered by priority so a value that could match two categories
 * (e.g. a number) is claimed by the more specific one first. Each pattern is
 * global so occurrences can be counted.
 *
 * Names, party names, and locations cannot be regex-guessed reliably, so they
 * are `ai: true` categories with no patterns: an optional server entity-detection
 * pass (see `@/api/redact`) supplies their candidates, which are merged into the
 * regex results. The backend returns entity-level kinds (person / organization /
 * location); `entityKind` maps each AI category to the kind it collects.
 */
export interface RedactCategory {
  key: string;
  label: string;
  blurb: string;
  defaultOn: boolean;
  patterns: RegExp[];
  /** AI-detected (named-entity) category: no regex, resolved by an LLM pass. */
  ai?: boolean;
  /** For AI categories, the backend entity `category` this maps from. */
  entityKind?: "person" | "organization" | "location";
}

export const CATEGORIES: RedactCategory[] = [
  {
    key: "gov_id",
    label: "Government IDs",
    blurb: "Social Security and employer identification numbers.",
    defaultOn: true,
    patterns: [/\b\d{3}-\d{2}-\d{4}\b/g, /\b\d{2}-\d{7}\b/g],
  },
  {
    key: "contact",
    label: "Contact info",
    blurb: "Email addresses and phone numbers.",
    defaultOn: true,
    patterns: [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      /\b(?:\+?1[.\s-]?)?\(?\d{3}\)?[.\s-]?\d{3}[.\s-]?\d{4}\b/g,
    ],
  },
  {
    key: "financial",
    label: "Financial",
    blurb: "Dollar amounts and payment-card numbers.",
    defaultOn: true,
    patterns: [/(?:US\$|USD|\$)\s?\d[\d,]*(?:\.\d{2})?/gi, /\b(?:\d{4}[ -]){3}\d{4}\b/g],
  },
  {
    key: "dates",
    label: "Dates",
    blurb: "Calendar dates (off by default; contracts contain many legitimate ones).",
    defaultOn: false,
    patterns: [
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,
    ],
  },
  // AI-detected categories (no regex). Off by default: each adds a server LLM
  // pass, so the user opts in. Candidates arrive from `detectEntities`.
  {
    key: "names",
    label: "Names",
    blurb: "People's names (detected by AI).",
    defaultOn: false,
    patterns: [],
    ai: true,
    entityKind: "person",
  },
  {
    key: "orgs",
    label: "Organizations",
    blurb: "Company and party names (detected by AI).",
    defaultOn: false,
    patterns: [],
    ai: true,
    entityKind: "organization",
  },
  {
    key: "locations",
    label: "Locations",
    blurb: "Addresses, cities, and places (detected by AI).",
    defaultOn: false,
    patterns: [],
    ai: true,
    entityKind: "location",
  },
];

export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

/** The UI category key that collects a given backend entity kind, if any. */
export function aiCategoryForEntity(entityKind: string): string | undefined {
  return CATEGORIES.find((c) => c.ai && c.entityKind === entityKind)?.key;
}
