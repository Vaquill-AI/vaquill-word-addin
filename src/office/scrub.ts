import { runWord } from "./run";

/**
 * One-click removal of the residual metadata that "Inspect Document" clears:
 * comments, tracked changes, document properties, and personal information
 * (author names) that would otherwise travel with a contract sent externally.
 *
 * `document.removeDocumentInformation` is WordApiDesktop only (no cross-platform
 * equivalent), so this is gated on `canScrubMetadata()`; on the web the UI keeps
 * pointing the user at Word's File > Info > Inspect Document instead.
 */

let scrubSupported: boolean | null = null;

/** Whether this host can scrub metadata in-place (Word desktop, not the web). */
export function canScrubMetadata(): boolean {
  if (scrubSupported === null) {
    try {
      scrubSupported = Office.context.requirements.isSetSupported("WordApiDesktop", "1.4");
    } catch {
      scrubSupported = false;
    }
  }
  return scrubSupported;
}

interface Scrubbable {
  removeDocumentInformation(type: unknown): void;
}

/** What we cleared, for an honest confirmation message. */
export interface ScrubResult {
  removed: string[];
}

export async function scrubDocumentMetadata(): Promise<ScrubResult> {
  return runWord(async (context) => {
    const doc = context.document as unknown as Scrubbable;
    const T = Word.RemoveDocInfoType;
    // Order does not matter; each call removes one class of residual data.
    doc.removeDocumentInformation(T.comments);
    doc.removeDocumentInformation(T.revisions);
    doc.removeDocumentInformation(T.documentProperties);
    doc.removeDocumentInformation(T.removePersonalInformation);
    await context.sync();
    return {
      removed: ["comments", "tracked changes", "document properties", "author/personal info"],
    };
  });
}
