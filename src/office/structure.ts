import { runWord } from "./run";

/**
 * Read paragraphs with their computed list numbering. A contract's section
 * numbers are often auto-numbered (Word list numbering), so they do NOT appear
 * in `paragraph.text`; the number is only available via `ListItem.listString`
 * (e.g. "7.4"). Reading both lets the cross-reference checker know which sections
 * actually exist, whether they are typed manually or auto-numbered.
 *
 * `listItemOrNullObject` + `listString` are WordApi 1.3 (GA cross-platform).
 */
export interface NumberedParagraph {
  text: string;
  /** Computed list number for an auto-numbered paragraph (e.g. "7.4"), or null. */
  listString: string | null;
}

export async function readNumberedParagraphs(): Promise<NumberedParagraph[]> {
  return runWord(async (context) => {
    const paras = context.document.body.paragraphs;
    paras.load("text");
    await context.sync();

    // Resolve each paragraph's list item (a null object when it is not a list
    // item), then load the computed number string in one batched sync.
    const listItems = paras.items.map((p) => p.listItemOrNullObject);
    for (const li of listItems) li.load("isNullObject,listString");
    await context.sync();

    return paras.items.map((p, i) => {
      const li = listItems[i];
      return {
        text: (p.text ?? "").trim(),
        listString: li.isNullObject ? null : (li.listString ?? null),
      };
    });
  });
}
