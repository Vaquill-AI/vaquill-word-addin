import { useCallback, useEffect, useRef, useState } from "react";
import {
  streamAssistant,
  type ChatMessage,
  type ChatSource,
  type AssistantOptions,
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
  /**
   * The reasoning steps the backend reported for this answer, in order, for the
   * collapsible "Finished in N steps" trace. Labels are sanitized at the source
   * (`sanitizeStepLabel` in api/chat.ts strips any vendor / model / MCP / URL
   * token before this is emitted), so persisting + displaying them is safe.
   */
  steps?: string[];
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
  // Mirror of the latest committed messages so `send`/`regenerate` can read the
  // current transcript without being rebuilt on every keystroke of state change.
  const messagesRef = useRef<AssistantMessage[]>(state.messages);
  useEffect(() => {
    messagesRef.current = state.messages;
  }, [state.messages]);

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

  // Replace the whole conversation with a stored one (aborting any in-flight
  // stream). Powers loading a past chat from History.
  const loadMessages = useCallback((messages: AssistantMessage[]) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ messages, streaming: false, thinking: null, error: null });
  }, []);

  // Drop the message with `id` and everything after it, aborting any in-flight
  // stream. Powers edit-and-re-run: the edited turn (and its now-stale answer)
  // is removed so re-sending replaces it rather than appending.
  const truncateBefore = useCallback((id: string) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => {
      const idx = s.messages.findIndex((m) => m.id === id);
      if (idx === -1) return s;
      return { ...s, streaming: false, thinking: null, messages: s.messages.slice(0, idx) };
    });
  }, []);

  const send = useCallback(
    async (text: string, scope: Scope, grounding?: AssistantOptions) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: AssistantMessage = { id: uuid(), role: "user", content: trimmed };
      const assistantId = uuid();

      // History sent to the backend (prior turns + this question). Read from the
      // ref so this reflects the latest committed transcript (e.g. right after a
      // truncation during regenerate), not a stale render closure.
      const history: ChatMessage[] = [
        ...messagesRef.current.map((m) => ({ role: m.role, content: m.content })),
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
            onThinking: (label) =>
              setState((s) => ({
                ...s,
                thinking: label,
                // Accumulate the step onto this answer so it survives as an
                // expandable trace after streaming (dedupe consecutive repeats).
                messages: s.messages.map((m) => {
                  if (m.id !== assistantId) return m;
                  const steps = m.steps ?? [];
                  return steps[steps.length - 1] === label ? m : { ...m, steps: [...steps, label] };
                }),
              })),
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
    [],
  );

  // Re-run the question that produced a given assistant answer: drop that answer
  // and its question, then resend the question. Deferred to a macrotask so the
  // truncation commits (and messagesRef updates) before `send` rebuilds history.
  const regenerate = useCallback(
    (assistantId: string, scope: Scope, grounding?: AssistantOptions) => {
      const msgs = messagesRef.current;
      const idx = msgs.findIndex((m) => m.id === assistantId);
      if (idx <= 0) return;
      const user = msgs[idx - 1];
      if (!user || user.role !== "user") return;
      truncateBefore(user.id);
      const content = user.content;
      setTimeout(() => void send(content, scope, grounding), 0);
    },
    [truncateBefore, send],
  );

  // Abort any in-flight stream when the view unmounts (tab switch).
  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, send, reset, stop, truncateBefore, loadMessages, regenerate };
}
