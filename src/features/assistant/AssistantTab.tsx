import type { AppIntent } from "@/app/nav";
import { AssistantView } from "./AssistantView";

/**
 * The Assistant tab. Ask (grounded chat) and Edit (describe a change, get
 * grounded redlines) are the same job from two doors; they are folded into one
 * surface with the mode tabs living INSIDE the composer, so switching never
 * leaves the input. This is now a thin pass-through: AssistantView owns both
 * modes and the shared composer.
 */
export function AssistantTab({
  intent,
  onIntentDone,
}: {
  intent?: AppIntent | null;
  onIntentDone?: () => void;
} = {}) {
  return <AssistantView intent={intent} onIntentDone={onIntentDone} />;
}
