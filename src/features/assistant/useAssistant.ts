import { useCallback, useEffect, useRef, useState } from "react";
import {
  streamAssistant,
  type ChatMessage,
  type ChatSource,
  type AssistantGrounding,
} from "@/api/chat";
import { readDocumentText, readSelectionText } from "@/office/document";
import { uuid } from "@/api/ids";
import { ApiError, friendlyMessage } from "@/api/errors";

export type Scope = "document" | "selection";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  pending?: boolean;
}

export interface AssistantState {
  messages: AssistantMessage[];
  streaming: boolean;
  thinking: string | null;
  error: string | null;
}

const INITIAL: AssistantState = { messages: [], streaming: false, thinking: null, error: null };

/** Conversation state for the grounded assistant. Streams deltas into a live message. */
export function useAssistant() {
  const [state, setState] = useState<AssistantState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL);
  }, []);

  // Stop an in-flight answer without wiping the conversation (Stop button).
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({
      ...s,
      streaming: false,
      thinking: null,
      messages: s.messages
        .filter((m) => !(m.role === "assistant" && m.pending && !m.content.trim()))
        .map((m) => (m.pending ? { ...m, pending: false } : m)),
    }));
  }, []);

  const send = useCallback(
    async (text: string, scope: Scope, grounding?: AssistantGrounding) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: AssistantMessage = { id: uuid(), role: "user", content: trimmed };
      const assistantId = uuid();

      // History sent to the backend (prior turns + this question).
      const history: ChatMessage[] = [
        ...state.messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: trimmed },
      ];

      setState((s) => ({
        ...s,
        streaming: true,
        thinking: "Reading the contract",
        error: null,
        messages: [
          ...s.messages,
          userMsg,
          { id: assistantId, role: "assistant", content: "", pending: true },
        ],
      }));

      const patchAssistant = (fn: (m: AssistantMessage) => AssistantMessage) =>
        setState((s) => ({
          ...s,
          messages: s.messages.map((m) => (m.id === assistantId ? fn(m) : m)),
        }));

      // Once the answer has been finalized, a later stream error (e.g. a dropped
      // trailing frame) should not slap an error banner over a complete answer.
      let finalized = false;

      try {
        const context = scope === "selection" ? await readSelectionText() : await readDocumentText();
        if (scope === "selection" && !context.trim()) {
          patchAssistant((m) => ({ ...m, content: "Select some text in the document first, then ask.", pending: false }));
          setState((s) => ({ ...s, streaming: false, thinking: null }));
          return;
        }

        await streamAssistant(
          history,
          context,
          {
            signal: controller.signal,
            onThinking: (label) => setState((s) => ({ ...s, thinking: label })),
            onSources: (sources) => patchAssistant((m) => ({ ...m, sources })),
            onDelta: (delta) =>
              setState((s) => ({
                ...s,
                thinking: null,
                messages: s.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + delta } : m,
                ),
              })),
            onFinal: (corrected) => {
              finalized = true;
              patchAssistant((m) => ({ ...m, content: corrected ?? m.content, pending: false }));
            },
          },
          grounding,
        );
        patchAssistant((m) => ({ ...m, pending: false }));
        setState((s) => ({ ...s, streaming: false, thinking: null }));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        // Answer already complete: keep it, just stop the streaming state.
        if (finalized) {
          patchAssistant((m) => ({ ...m, pending: false }));
          setState((s) => ({ ...s, streaming: false, thinking: null }));
          return;
        }
        const error = e instanceof ApiError ? friendlyMessage(e) : (e as Error).message;
        setState((s) => ({
          ...s,
          streaming: false,
          thinking: null,
          error,
          // Drop the assistant placeholder if nothing streamed; keep partial text otherwise.
          messages: s.messages
            .filter((m) => !(m.id === assistantId && !m.content.trim()))
            .map((m) => (m.id === assistantId ? { ...m, pending: false } : m)),
        }));
      }
    },
    [state.messages],
  );

  // Abort any in-flight stream when the view unmounts (tab switch).
  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, send, reset, stop };
}
