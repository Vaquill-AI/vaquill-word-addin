import { request } from "./http";

/**
 * Legal research over the US statute corpus (USC / CFR / state codes). Lets a
 * lawyer search for a section, read its exact text, ask a grounded question
 * about it, and drop it into the document, without leaving Word.
 *
 * Backend base: /api/v1/us-statutes (all responses are camelCase via
 * serialization_alias).
 */
const BASE = "/api/v1/us-statutes";

export type StatuteCorpus = "usc" | "cfr" | "state";

/** One statute search result card. `highlightSnippet` is backend-sanitized HTML. */
export interface StatuteResult {
  actId: string;
  corpusType: string;
  citation: string | null;
  citationShort: string | null;
  displayLabel: string | null;
  sectionTitle: string | null;
  popularName: string | null;
  actStatus: string | null;
  state: string | null;
  highlightSnippet: string | null;
}

export interface StatuteSearchResponse {
  results: StatuteResult[];
  total: number;
  page: number;
  pageSize: number;
}

/** A friendly, insertable label for a result (citation preferred, then label). */
export function statuteLabel(r: StatuteResult): string {
  return r.citation || r.citationShort || r.displayLabel || r.sectionTitle || r.actId;
}

export async function searchStatutes(
  query: string,
  opts: { corpusType?: StatuteCorpus; page?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<StatuteSearchResponse> {
  return request<StatuteSearchResponse>(`${BASE}/search`, {
    method: "POST",
    body: {
      query,
      corpusType: opts.corpusType,
      page: opts.page ?? 1,
      pageSize: opts.pageSize ?? 20,
    },
    signal,
  });
}

export interface StatuteBody {
  actId: string;
  html: string | null;
  plain: string | null;
  available: boolean;
  note: string | null;
}

export async function getStatuteBody(actId: string, signal?: AbortSignal): Promise<StatuteBody> {
  return request<StatuteBody>(`${BASE}/section/${encodeURIComponent(actId)}/body`, { signal });
}

export interface StatuteAsk {
  answer: string;
  citation: string | null;
  confidence: string;
  notInSection: boolean;
}

/** Ask a grounded question answered from this section's text (fast mode). */
export async function askStatuteSection(
  actId: string,
  question: string,
  signal?: AbortSignal,
): Promise<StatuteAsk> {
  return request<StatuteAsk>(`${BASE}/section/${encodeURIComponent(actId)}/ask`, {
    method: "POST",
    body: { question, mode: "fast" },
    signal,
  });
}

// --- Case law (brief only) -------------------------------------------------
// We deliberately surface only the generated IRAC brief, never raw opinion
// text. The brief is a synthesized transformation the backend returns; the
// pane never fetches or displays the underlying source document.

/** A case resolved from a citation (via the same lookup the Authority tab uses). */
export interface CaseMatch {
  clusterId: number;
  caseName: string | null;
  court: string | null;
  year: string | null;
}

interface RawCluster {
  id?: number;
  case_name?: string;
  caseName?: string;
  case_name_short?: string;
  court?: string;
  court_id?: string;
  date_filed?: string;
}
interface RawLookupEntry {
  citation?: string;
  status?: number | string;
  clusters?: RawCluster[];
}

/** Resolve a case citation to a single best-match case. Returns null if unmatched. */
export async function resolveCase(citation: string, signal?: AbortSignal): Promise<CaseMatch | null> {
  const res = await request<RawLookupEntry[]>(
    `/api/v1/us/citation-lookup?citation=${encodeURIComponent(citation)}`,
    { signal },
  );
  const entry = Array.isArray(res) ? res[0] : undefined;
  const cluster = entry?.clusters?.[0];
  const statusOk = entry?.status == null || Number(entry.status) === 200;
  if (!cluster || !statusOk || typeof cluster.id !== "number") return null;
  const court = cluster.court ?? cluster.court_id;
  return {
    clusterId: cluster.id,
    caseName: cluster.case_name ?? cluster.caseName ?? cluster.case_name_short ?? null,
    court: court && !court.startsWith("http") ? court : null,
    year: (cluster.date_filed ?? "").slice(0, 4) || null,
  };
}

export interface CaseBrief {
  brief: string; // IRAC markdown
  fromCache: boolean;
}
interface RawBrief {
  brief?: string;
  from_cache?: boolean;
  fromCache?: boolean;
}

/**
 * Get (or generate) an IRAC brief for a case. First generation runs an LLM and
 * can take a while, so this uses a longer timeout; repeat calls are cached.
 */
export async function getCaseBrief(clusterId: number, signal?: AbortSignal): Promise<CaseBrief> {
  const res = await request<RawBrief>(`/api/v1/us/cases/${clusterId}/brief`, {
    signal,
    timeoutMs: 90_000,
  });
  return { brief: res.brief ?? "", fromCache: res.from_cache ?? res.fromCache ?? false };
}

/** Escape the three HTML-significant characters in text content. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Apply inline emphasis (**bold**) on already-escaped text. */
function inlineMarkdown(escaped: string): string {
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/** How a markdown heading should land in the document. */
export interface MarkdownHtmlOptions {
  /**
   * "heading" emits real <h2>..<h4>, which Word maps to its Heading styles.
   * "bold" emits a bold paragraph instead. Use "bold" when dropping text into
   * SOMEONE ELSE'S document (an assistant answer inserted into a contract):
   * Word Heading styles get a collapse caret, join the Navigation pane, and
   * show up in a table of contents, which silently restructures their file.
   */
  headings?: "heading" | "bold";
  /**
   * "native" emits <ul>/<ol>, which Word turns into real list items (List
   * Paragraph style, folded into the surrounding numbering scheme). "plain"
   * emits paragraphs with a literal marker. Same reasoning as `headings`: use
   * "plain" for reference text dropped into someone else's document, where a
   * native list can disturb the document's own numbering.
   */
  lists?: "native" | "plain";
}

/**
 * Convert the brief's IRAC markdown to safe HTML for a Word insert: headings,
 * bold, bullet/numbered lists, and paragraphs. All text content is escaped
 * first, so only the structural tags we emit are markup (no injection).
 */
export function markdownToSafeHtml(md: string, opts: MarkdownHtmlOptions = {}): string {
  const headingMode = opts.headings ?? "heading";
  const listMode = opts.lists ?? "native";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let para: string[] = [];
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inlineMarkdown(escapeHtml(para.join(" ")))}</p>`);
      para = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushPara();
      closeList();
      const text = inlineMarkdown(escapeHtml(heading[2]));
      if (headingMode === "bold") {
        out.push(`<p><strong>${text}</strong></p>`);
      } else {
        const level = Math.min(heading[1].length + 1, 4);
        out.push(`<h${level}>${text}</h${level}>`);
      }
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const itemText = inlineMarkdown(escapeHtml(bullet ? bullet[1] : numbered![2]));
      if (listMode === "plain") {
        closeList();
        out.push(`<p>${bullet ? "&#8226; " : `${numbered![1]}. `}${itemText}</p>`);
        continue;
      }
      const t = bullet ? "ul" : "ol";
      if (listType !== t) {
        closeList();
        out.push(`<${t}>`);
        listType = t;
      }
      out.push(`<li>${itemText}</li>`);
      continue;
    }
    para.push(line);
  }
  flushPara();
  closeList();
  return out.join("");
}
