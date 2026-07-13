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

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: image (![]) before link ([]) so an image is not read as a
  // link; bold (**) before italic (*) so **x** is not read as *…*. Underscore
  // italic is intentionally omitted: legal text is full of identifiers like
  // Sample_NDA_Agreement that would be mangled.
  const regex =
    /!\[([^\]]*)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
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

export function Markdown({ text }: { text: string }): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let quote: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p${key}`}>{renderInline(para.join(" "), `p${key}`)}</p>);
      key += 1;
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const current = list;
      const items = current.items.map((it, idx) => <li key={idx}>{renderInline(it, `li${key}-${idx}`)}</li>);
      blocks.push(current.ordered ? <ol key={`l${key}`}>{items}</ol> : <ul key={`l${key}`}>{items}</ul>);
      key += 1;
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push(
        <blockquote key={`q${key}`} className="msg__quote">
          {renderInline(quote.join(" "), `q${key}`)}
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
                  <th key={ci}>{renderInline(h, `th${key}-${ci}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {header.map((_, ci) => (
                    <td key={ci}>{renderInline(r[ci] ?? "", `td${key}-${ri}-${ci}`)}</td>
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
          {renderInline(heading[2].replace(/\s+#+\s*$/, ""), `h${key}`)}
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
