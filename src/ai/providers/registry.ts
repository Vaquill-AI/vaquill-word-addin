import { ApiError } from "@/api/errors";
import { getActiveProvider, getKey, getModel } from "@/ai/keys";
import { makeOpenAI } from "./openai";
import { makeAnthropic } from "./anthropic";
import type { LlmProvider, ProviderId } from "./types";

/** Construct a provider bound to a specific key + model (used by the key tester). */
export function makeProvider(p: ProviderId, apiKey: string, model: string): LlmProvider {
  return p === "anthropic" ? makeAnthropic(apiKey, model) : makeOpenAI(apiKey, model);
}

/** The provider bound to the user's saved key + model, or a NO_KEY error. */
export function getProvider(): LlmProvider {
  const p = getActiveProvider();
  const key = getKey(p);
  if (!key) {
    throw new ApiError("unauthorized", 401, "Add your API key in Settings to use AI features.", "NO_KEY");
  }
  return makeProvider(p, key, getModel(p));
}
