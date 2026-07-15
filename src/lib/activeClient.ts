import { listMatters } from "@/api/platform";
import { activeClientRulesContext, getActiveClientId, setActiveClientId } from "./clientRules";

/**
 * Resolve the active client id for per-client rules: the explicitly chosen one,
 * or (when none is set) the default matter's client, which is then remembered so
 * later reviews reuse it. Best-effort; returns "" when there is no client
 * context. Keeps the API dependency out of the pure clientRules store.
 */
export async function resolveActiveClientId(matterId?: string): Promise<string> {
  const current = getActiveClientId();
  if (current) return current;
  if (!matterId) return "";
  try {
    const matters = await listMatters();
    const clientId = matters.find((m) => m.id === matterId)?.clientId;
    if (clientId) {
      setActiveClientId(clientId);
      return clientId;
    }
  } catch {
    // No client context available; rules simply do not apply.
  }
  return "";
}

/**
 * The active client's rules as a prompt context block, resolving the client from
 * the matter first when none is set. "" when there is no client or no rules.
 */
export async function resolveClientRulesContext(matterId?: string): Promise<string> {
  await resolveActiveClientId(matterId);
  return activeClientRulesContext();
}
