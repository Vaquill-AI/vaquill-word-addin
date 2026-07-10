import { runWord } from "./run";
import {
  REVIEW_NS,
  snapshotToXml,
  snapshotFromXml,
  type ReviewSnapshot,
} from "@/lib/reviewState";

/** Read/write the last review, stored as a custom XML part inside the .docx. */
export async function readReviewSnapshot(): Promise<ReviewSnapshot | null> {
  return runWord(async (context) => {
    const parts = context.document.customXmlParts.getByNamespace(REVIEW_NS);
    parts.load("items");
    await context.sync();
    if (parts.items.length === 0) return null;

    const xml = parts.items[0].getXml();
    await context.sync();
    return snapshotFromXml(xml.value);
  });
}

export async function writeReviewSnapshot(snapshot: ReviewSnapshot): Promise<void> {
  return runWord(async (context) => {
    const parts = context.document.customXmlParts.getByNamespace(REVIEW_NS);
    parts.load("items");
    await context.sync();
    for (const part of parts.items) part.delete();
    await context.sync();

    context.document.customXmlParts.add(snapshotToXml(snapshot));
    await context.sync();
  });
}
