import { streamAssistant } from "@/api/chat";

/**
 * Draft a negotiation RESPONSE to one of the counterparty's tracked changes.
 *
 * The Changes view already helps the reviewer DECIDE (triage: accept / review /
 * reject). This closes the loop with the RESPOND half: a short, professional
 * reply the reviewer can edit and drop into the margin as a Word comment,
 * grounded in our playbook's positions (its fallback ladder is where a real
 * compromise comes from). It never edits the contract body - a comment is
 * advisory, which is the trust-safe negotiation move a lawyer actually makes.
 */

const PROMPT =
  "You are counsel responding to the OTHER SIDE's tracked change to a contract, on our client's behalf. " +
  "Our preferred and fallback positions are in the context (when provided). Write a SHORT, professional reply " +
  "comment addressed to the counterparty that we could paste into the margin next to their change: either " +
  "accept it briefly, push back with a concise reason, or propose a SPECIFIC compromise grounded in our " +
  "fallback position. Be concrete and courteous, in the register one counsel uses to another. Do not invent " +
  "facts, numbers, or authority that are not given. Keep it under 60 words. " +
  "Output ONLY the comment text: no preamble, no surrounding quotes, no label.";

/**
 * Generate the reply text for a single counterparty change. `positions` is the
 * compact playbook summary (positionsSummary) or null for general judgment.
 * Mirrors triage's salvage of a dropped trailing `done` frame: if the full text
 * arrived but the stream threw on close, we keep it rather than force a re-run.
 */
export async function draftCounterReply(
  changeText: string,
  positions: string | null,
  signal?: AbortSignal,
): Promise<string> {
  const context =
    (positions ? `OUR POSITIONS:\n${positions}\n\n` : "") + `THEIR CHANGE:\n${changeText.trim()}`;

  let acc = "";
  let streamError: unknown = null;
  try {
    await streamAssistant(
      [{ role: "user", content: PROMPT }],
      context,
      {
        signal,
        onDelta: (d) => {
          acc += d;
        },
        onFinal: (final) => {
          if (final) acc = final;
        },
      },
      { useRag: false },
    );
  } catch (e) {
    streamError = e;
  }

  const text = acc.trim();
  if (!text) {
    if (streamError) throw streamError;
    throw new Error("The reply could not be generated. Please try again.");
  }
  return text;
}
