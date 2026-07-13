import { runWord } from "./run";

/**
 * Native inline annotations (Word's own writing-assistance "critique" surface):
 * paint a colored underline on the exact text of a finding, rendered by Word
 * itself rather than only in our pane. Advisory only (flags / advice) - actual
 * edits stay tracked-change redlines.
 *
 * `Paragraph.insertAnnotations` is WordApi 1.7, so everything is gated on
 * `canAnnotate()` and wrapped so an unsupported host, an older typings build, or
 * an API quirk degrades to "no annotations painted" and never breaks a scan.
 * Types are accessed through narrow casts so the file compiles regardless of the
 * installed @types/office-js version.
 */

export type CritiqueColor = "Red" | "Green" | "Blue" | "Lavender" | "Berry";

export interface CritiqueItem {
  /** Verbatim document text to underline (first occurrence is used). */
  text: string;
  color: CritiqueColor;
}

interface Annotatable {
  insertAnnotations(set: {
    critiques: { colorScheme: string; start: number; length: number }[];
  }): { value?: string[] };
}

let annotationsSupported: boolean | null = null;

/** Whether the host supports native annotations (WordApi 1.7+). */
export function canAnnotate(): boolean {
  if (annotationsSupported === null) {
    try {
      annotationsSupported = Office.context.requirements.isSetSupported("WordApi", "1.7");
    } catch {
      annotationsSupported = false;
    }
  }
  return annotationsSupported;
}

// The ids we inserted, so `clearCritiques` removes only ours (never another
// add-in's or Word's own writing-assistance annotations).
let ourAnnotationIds: string[] = [];

/**
 * Paint each item as a native colored critique underline on its text. Best-effort
 * per item (a value not found in the document is skipped). Returns how many were
 * painted. Never throws.
 */
export async function paintCritiques(items: CritiqueItem[]): Promise<number> {
  if (!canAnnotate() || items.length === 0) return 0;
  return runWord(async (context) => {
    let painted = 0;
    const inserted: string[] = [];
    for (const item of items) {
      const needle = item.text.trim().slice(0, 255);
      if (!needle) continue;
      try {
        const results = context.document.body.search(needle, { matchCase: true });
        results.load("items");
        await context.sync();
        if (results.items.length === 0) continue;

        // Annotation offsets are relative to the containing paragraph, so find
        // the paragraph and the needle's index within its text.
        const para = results.items[0].paragraphs.getFirst();
        para.load("text");
        await context.sync();
        const start = para.text.indexOf(needle);
        if (start < 0) continue;

        const res = (para as unknown as Annotatable).insertAnnotations({
          critiques: [{ colorScheme: item.color, start, length: needle.length }],
        });
        await context.sync();
        if (res.value) inserted.push(...res.value);
        painted += 1;
      } catch {
        // Advisory only: skip this item, never break the batch.
      }
    }
    ourAnnotationIds = ourAnnotationIds.concat(inserted);
    return painted;
  }).catch(() => 0);
}

/** Remove the critiques we painted (leaves any other annotations untouched). */
export async function clearCritiques(): Promise<void> {
  if (!canAnnotate() || ourAnnotationIds.length === 0) return;
  const ids = ourAnnotationIds;
  ourAnnotationIds = [];
  await runWord(async (context) => {
    const doc = context.document as unknown as {
      getAnnotationById(id: string): { delete(): void };
    };
    for (const id of ids) {
      try {
        doc.getAnnotationById(id).delete();
      } catch {
        // Already gone (user deleted the text / accepted it) - fine.
      }
    }
    await context.sync();
  }).catch(() => {
    // Best-effort cleanup.
  });
}
