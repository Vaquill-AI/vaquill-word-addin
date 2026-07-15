import { ApiError } from "@/api/errors";
import { extractClausePrompt, fillPrompt, playbookExtractPrompt } from "@/ai/prompts";
import { storeReference } from "./draft";
import { extractTextFromFile } from "./extractText";
import { runJson } from "./llm";

/**
 * Community replacement for the multipart upload endpoints. The backend existed
 * only because the browser could not parse PDF/DOCX; here we extract the text on
 * device (extractText.ts) and, where the feature is an LLM task, run the user's
 * provider. Returns the SAME shapes the backend does, so the api/*.ts wrappers
 * and the feature UIs are untouched.
 */
function parsePlaceholders(v: FormDataEntryValue | null): string[] {
  if (typeof v !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function communityRequestForm<T>(path: string, form: FormData): Promise<T> {
  const clean = path.split("?")[0];

  // Playbook extraction sends a `text` field, not a file.
  if (clean === "/api/v1/legal-tools/playbooks/extract-from-docx") {
    const text = typeof form.get("text") === "string" ? (form.get("text") as string) : "";
    const p = playbookExtractPrompt(text);
    const raw = (await runJson(p.system, p.user)) as {
      positions?: Record<string, unknown>;
      contractType?: unknown;
    };
    const positions = raw.positions && typeof raw.positions === "object" ? raw.positions : {};
    return {
      positions,
      extracted_count: Object.keys(positions).length,
      contract_type: typeof raw.contractType === "string" ? raw.contractType : "",
      jurisdiction: "US",
      source: "text",
    } as T;
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("invalid", 0, "No file was provided.");
  }

  const { text, filename } = await extractTextFromFile(file);

  if (clean === "/api/v1/drafting/extract-text") {
    return { text, chars: text.length, truncated: false, filename } as T;
  }

  if (clean === "/api/v1/drafting/upload-reference") {
    return storeReference(text, filename) as T;
  }

  if (clean === "/api/v1/drafting/extract-clause") {
    const clause = typeof form.get("clause") === "string" ? (form.get("clause") as string) : "";
    const p = extractClausePrompt(clause, text);
    const raw = (await runJson(p.system, p.user)) as Record<string, unknown>;
    return {
      found: raw.found === true,
      label: typeof raw.label === "string" ? raw.label : clause,
      text: typeof raw.text === "string" ? raw.text : "",
    } as T;
  }

  if (clean === "/api/v1/drafting/fill-from-reference") {
    const placeholders = parsePlaceholders(form.get("placeholders"));
    const p = fillPrompt(placeholders, text);
    const raw = (await runJson(p.system, p.user)) as { fills?: unknown };
    const fills = Array.isArray(raw.fills) ? raw.fills : [];
    return { fills, referenceChars: text.length, truncated: false } as T;
  }

  throw new ApiError(
    "unknown",
    0,
    "This feature needs a Vaquill AI account and is not available in the community edition.",
    "REQUIRES_ACCOUNT",
  );
}
