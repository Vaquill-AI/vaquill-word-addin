import { makeProvider } from "@/ai/providers/registry";
import type { ProviderId } from "@/ai/providers/types";

/**
 * Live one-call check that a key works, for the Settings "Test" button and the
 * setup wizard. Resolves on success; throws a mapped ApiError (invalid key, rate
 * limit, provider down) that the UI already knows how to render.
 */
export async function testKey(p: ProviderId, apiKey: string, model: string): Promise<void> {
  const provider = makeProvider(p, apiKey, model);
  await provider.chat({
    messages: [{ role: "user", content: "Reply with the single word OK." }],
    maxTokens: 5,
  });
}
