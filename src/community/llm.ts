import { getProvider } from "@/ai/providers/registry";

/**
 * Shared JSON-mode runner for the community shim. Used by both the JSON request
 * router and the multipart form router. Tolerates a model that wraps its JSON in
 * prose or code fences by extracting the outermost object/array.
 */
export function parseJson(text: string): unknown {
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
  return {};
}

export async function runJson(system: string, user: string): Promise<unknown> {
  const { text } = await getProvider().chat({
    system,
    messages: [{ role: "user", content: user }],
    json: true,
    maxTokens: 4096,
  });
  return parseJson(text);
}
