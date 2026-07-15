import { getProvider } from "@/ai/providers/registry";

/**
 * Shared JSON-mode runner for the community shim. Used by both the JSON request
 * router and the multipart form router. Tolerates a model that wraps its JSON in
 * prose or code fences by extracting the outermost object/array.
 */

/**
 * Parse the model's text into JSON, tolerating prose or code-fence wrapping by
 * extracting the outermost object/array. Returns `undefined` when nothing
 * parses, so callers can distinguish a hard parse failure from a genuinely
 * empty `{}` and decide whether to retry.
 */
function tryParseJson(text: string): unknown | undefined {
  const attempt = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const direct = attempt(text);
  if (direct !== undefined) return direct;
  const obj = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (obj !== -1 && objEnd > obj) {
    const v = attempt(text.slice(obj, objEnd + 1));
    if (v !== undefined) return v;
  }
  const arr = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arr !== -1 && arrEnd > arr) {
    const v = attempt(text.slice(arr, arrEnd + 1));
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * Lenient parse for callers that always want an object back: returns `{}` when
 * nothing parses so a downstream shape access never throws.
 */
export function parseJson(text: string): unknown {
  return tryParseJson(text) ?? {};
}

async function chatText(system: string, user: string): Promise<string> {
  const { text } = await getProvider().chat({
    system,
    messages: [{ role: "user", content: user }],
    json: true,
    maxTokens: 4096,
  });
  return text;
}

/**
 * Run a JSON-mode completion and return the parsed value. If the model emits
 * unparseable output (stray prose, an unterminated object, a stray code fence),
 * retry once with a firmer instruction before falling back to `{}`. The retry
 * is cheap and recovers the common "model added a sentence around the JSON"
 * failure without a heavier per-feature schema layer.
 */
export async function runJson(system: string, user: string): Promise<unknown> {
  const first = tryParseJson(await chatText(system, user));
  if (first !== undefined) return first;
  const retry = tryParseJson(
    await chatText(
      system,
      `${user}\n\nReturn ONLY a single valid JSON value. No prose, no markdown, no code fences.`,
    ),
  );
  return retry ?? {};
}
