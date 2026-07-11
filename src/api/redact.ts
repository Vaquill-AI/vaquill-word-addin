import { request } from "./http";

/**
 * AI named-entity detection for the redaction feature.
 *
 * Complements the deterministic regex scan (IDs, contact info, financial) with
 * person / organization / location entities that regex cannot detect reliably.
 * The backend guarantees each `text` is a VERBATIM substring of the document so
 * the office redaction layer can find and remove it.
 */

/** One AI-detected entity. `category` is the backend entity kind
 *  ("person" | "organization" | "location"); `text` is a verbatim substring. */
export interface DetectedEntity {
  category: string;
  text: string;
}

interface DetectEntitiesResponse {
  entities: DetectedEntity[];
}

const DETECT_ENTITIES = "/api/v1/redaction/detect-entities";

/**
 * Ask the backend to detect person / organization / location entities in the
 * document text. Returns `[]` on any failure (including cancellation) so the
 * caller can keep its deterministic regex results and never block the scan on
 * the AI pass.
 */
export async function detectEntities(
  documentText: string,
  signal?: AbortSignal,
): Promise<DetectedEntity[]> {
  try {
    // Backend body is camelCase (documentText); see DetectEntitiesRequest.
    const res = await request<DetectEntitiesResponse>(DETECT_ENTITIES, {
      method: "POST",
      body: { documentText },
      signal,
    });
    return Array.isArray(res?.entities) ? res.entities : [];
  } catch {
    // Degrade silently: the regex scan already produced usable candidates.
    return [];
  }
}
