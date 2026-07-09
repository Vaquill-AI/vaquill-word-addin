import type { ReactNode } from "react";

/**
 * Minimal markdown renderer for assistant answers: paragraphs, bullet and
 * numbered lists, bold, and inline code. Deliberately dependency-free and
 * scoped to what legal Q&A answers actually use.
 */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<strong key={`${keyBase}-b${i}`}>{m[1]}</strong>);
    else if (m[2] !== undefined) nodes.push(<code key={`${keyBase}-c${i}`}>{m[2]}</code>);
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
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

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
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
  return <>{blocks}</>;
}
