import { runWord } from "./run";
import { GOVERNANCE_NS, ledgerToXml, ledgerFromXml, type GovernanceLedger } from "@/lib/governance";

/**
 * Persist and read the governance ledger as a custom XML part inside the .docx
 * (WordApi 1.4). The part travels with the file through save, close, reopen, and
 * email, so the sign-off record is available wherever the document goes.
 */

export async function readLedger(): Promise<GovernanceLedger | null> {
  return runWord(async (context) => {
    const parts = context.document.customXmlParts.getByNamespace(GOVERNANCE_NS);
    parts.load("items");
    await context.sync();
    if (parts.items.length === 0) return null;

    const xml = parts.items[0].getXml();
    await context.sync();
    return ledgerFromXml(xml.value);
  });
}

/** Upsert the ledger: remove any existing part in our namespace, then add the new one. */
export async function writeLedger(ledger: GovernanceLedger): Promise<void> {
  return runWord(async (context) => {
    const parts = context.document.customXmlParts.getByNamespace(GOVERNANCE_NS);
    parts.load("items");
    await context.sync();

    for (const part of parts.items) part.delete();
    await context.sync();

    context.document.customXmlParts.add(ledgerToXml(ledger));
    await context.sync();
  });
}
