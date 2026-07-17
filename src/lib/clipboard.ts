/**
 * Clipboard helpers for the task pane.
 *
 * The async Clipboard API is unreliable inside the Office WebView: depending on
 * host and platform it can reject for permission or user-activation reasons, and
 * a bare `navigator.clipboard.write(...)` in a try/catch then fails silently, so
 * the user clicks Copy and nothing happens. Each helper therefore walks a
 * fallback chain ending in the legacy `execCommand` path (which still works in
 * restricted embedders) and returns whether anything actually reached the
 * clipboard, so callers can show real feedback instead of a false success.
 */

/** Legacy rich copy: select a hidden contentEditable node so formatting survives. */
function execCopyHtml(html: string): boolean {
  try {
    const host = document.createElement("div");
    host.contentEditable = "true";
    host.innerHTML = html;
    host.style.position = "fixed";
    host.style.left = "-9999px";
    host.style.opacity = "0";
    document.body.appendChild(host);
    const range = document.createRange();
    range.selectNodeContents(host);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const ok = document.execCommand("copy");
    sel?.removeAllRanges();
    document.body.removeChild(host);
    return ok;
  } catch {
    return false;
  }
}

/** Legacy plain copy via a hidden textarea. */
function execCopyText(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Copy plain text. Returns false only when every path is blocked. */
export async function copyPlain(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  return execCopyText(text);
}

/**
 * Copy with both a formatted (HTML) and a plain flavor, so pasting into Word
 * keeps the formatting while plain targets get readable text. Degrades to rich
 * legacy, then plain, then plain legacy.
 */
export async function copyRich(html: string, plain: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    // fall through
  }
  if (execCopyHtml(html)) return true;
  return copyPlain(plain);
}
