import type { ReactNode } from "react";

/**
 * Minimal markdown renderer for assistant answers: headings, paragraphs, bullet
 * and numbered lists, tables, blockquotes, bold, italic, inline code, links, and
 * images. Deliberately dependency-free (the task pane is a plain webview, so this
 * maps markdown to HTML) and scoped to what legal Q&A answers actually use.
 */

// Safe sources for an inline image: remote http(s), or an embedded image data
// URI (charts/tables the model renders). Anything else falls back to alt text.
const SAFE_IMG = /^(https?:\/\/|data:image\/)/i;

/** Lets the renderer turn [N] / [N,M] / [N-M] citation markers into hoverable,
 *  clickable chips that jump to the matching source. Supplied by the caller that
 *  also renders the source list; omitted when there are no sources. */
export interface CitationCtx {
  /** Tooltip label for citation N (the source's name), or undefined if out of range. */
  labelOf: (n: number) => string | undefined;
  /** Reveal + scroll to source N (opens the sources panel). */
  onCite: (n: number) => void;
}

// Expand a citation marker's inner text ("11", "11,12", "11-13") to its numbers.
function expandCitation(raw: string): number[] {
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const p = part.trim();
    if (p.includes("-")) {
      const [a, b] = p.split("-").map((x) => parseInt(x.trim(), 10));
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a && b - a < 50) {
        for (let n = a; n <= b; n++) out.push(n);
      }
    } else {
      const n = parseInt(p, 10);
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

function renderInline(text: string, keyBase: string, cite?: CitationCtx): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: image (![]) before link ([]) so an image is not read as a
  // link; bold (**) before italic (*) so **x** is not read as *…*. Underscore
  // italic is intentionally omitted: legal text is full of identifiers like
  // Sample_NDA_Agreement that would be mangled.
  const regex =
    /!\[([^\]]*)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\[(\d+(?:\s*[,-]\s*\d+)*)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined && m[2] !== undefined) {
      // Image. Render only safe sources; else keep the alt text so nothing breaks.
      nodes.push(
        SAFE_IMG.test(m[2]) ? (
          <img key={`${keyBase}-img${i}`} src={m[2]} alt={m[1]} className="msg__img" />
        ) : (
          m[1] || null
        ),
      );
    } else if (m[3] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{m[3]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<em key={`${keyBase}-i${i}`}>{m[4]}</em>);
    } else if (m[5] !== undefined) {
      nodes.push(<code key={`${keyBase}-c${i}`}>{m[5]}</code>);
    } else if (m[6] !== undefined && m[7] !== undefined) {
      // Only render safe http(s) links; anything else stays as its label text.
      const url = m[7];
      nodes.push(
        /^https?:\/\//i.test(url) ? (
          <a key={`${keyBase}-a${i}`} href={url} target="_blank" rel="noreferrer">
            {m[6]}
          </a>
        ) : (
          m[6]
        ),
      );
    } else if (m[8] !== undefined) {
      // Citation marker [N] / [N,M] / [N-M]: render each number as a hoverable
      // chip that jumps to its source. If we have no citation context, or the
      // number is out of range, leave the marker as plain text (never break it).
      const chips = cite ? expandCitation(m[8]).filter((n) => cite.labelOf(n) !== undefined) : [];
      if (cite && chips.length) {
        nodes.push(
          <sup key={`${keyBase}-cite${i}`} className="msg__cites">
            {chips.map((n) => (
              <button
                type="button"
                key={n}
                className="msg__cite"
                title={cite.labelOf(n)}
                onClick={() => cite.onCite(n)}
              >
                {n}
              </button>
            ))}
          </sup>,
        );
      } else {
        nodes.push(m[0]);
      }
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// A table separator row is only dashes/colons/pipes/space, with a dash and a
// pipe (e.g. "| --- | :--: |"). This is the real discriminator that a preceding
// pipe line is actually a table header, not a sentence that happens to contain |.
function isTableSeparator(line: string): boolean {
  const t = line.trim();
  return /^\|?[\s:|-]+\|?$/.test(t) && t.includes("-") && t.includes("|");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function Markdown({ text, citations }: { text: string; citations?: CitationCtx }): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let quote: string[] = [];
  let key = 0;
  // Every inline render carries the citation context so [N] markers anywhere in
  // the answer (paragraphs, lists, table cells) become chips.
  const ri = (t: string, k: string) => renderInline(t, k, citations);

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p${key}`}>{ri(para.join(" "), `p${key}`)}</p>);
      key += 1;
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const current = list;
      const items = current.items.map((it, idx) => <li key={idx}>{ri(it, `li${key}-${idx}`)}</li>);
      blocks.push(current.ordered ? <ol key={`l${key}`}>{items}</ol> : <ul key={`l${key}`}>{items}</ul>);
      key += 1;
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push(
        <blockquote key={`q${key}`} className="msg__quote">
          {ri(quote.join(" "), `q${key}`)}
        </blockquote>,
      );
      key += 1;
      quote = [];
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      flushQuote();
      continue;
    }
    // Blockquotes / GitHub admonitions ("> [!NOTE] > ..."). The leading > and
    // the [!TYPE] marker are stripped so they never leak as literal text.
    const quoteLine = /^\s*>\s?(.*)/.exec(line);
    if (quoteLine) {
      flushPara();
      flushList();
      const cleaned = quoteLine[1]
        .replace(/^\s*>\s?/, "")
        .replace(/\[!(note|tip|important|warning|caution)\]/gi, "")
        .trim();
      if (cleaned) quote.push(cleaned);
      continue;
    }
    // Any other content line ends an open blockquote.
    flushQuote();

    // Tables: a pipe row immediately followed by a separator row. Rendered in a
    // horizontally-scrollable wrapper so a wide table never overflows the pane.
    if (line.includes("|") && idx + 1 < lines.length && isTableSeparator(lines[idx + 1])) {
      flushPara();
      flushList();
      const header = splitRow(line);
      const rows: string[][] = [];
      let j = idx + 2;
      while (j < lines.length && lines[j].trim() && lines[j].includes("|")) {
        rows.push(splitRow(lines[j].trimEnd()));
        j += 1;
      }
      blocks.push(
        <div key={`tw${key}`} className="msg__table-wrap">
          <table className="msg__table">
            <thead>
              <tr>
                {header.map((h, ci) => (
                  <th key={ci}>{ri(h, `th${key}-${ci}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rowIdx) => (
                <tr key={rowIdx}>
                  {header.map((_, ci) => (
                    <td key={ci}>{ri(r[ci] ?? "", `td${key}-${rowIdx}-${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      key += 1;
      idx = j - 1;
      continue;
    }

    // ATX headings (#, ##, ...). Rendered at modest sizes for a narrow pane;
    // the leading hashes never leak as literal text.
    const heading = /^(#{1,6})\s+(.*)/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = Math.min(heading[1].length, 4);
      blocks.push(
        <p key={`h${key}`} className={`msg__heading msg__heading--${level}`}>
          {ri(heading[2].replace(/\s+#+\s*$/, ""), `h${key}`)}
        </p>,
      );
      key += 1;
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)/.exec(line);
    if (bullet) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
    } else if (ordered) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  flushQuote();
  return <>{blocks}</>;
}
