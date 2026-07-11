import { useEffect, useMemo, useRef, useState } from "react";
import { Banner, LiveRegion, Spinner } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { MessageBubble } from "./MessageBubble";
import { Composer, type ComposerHandle } from "./Composer";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { ChatHistory } from "./ChatHistory";
import { deriveTitle, getConversation, saveConversation } from "./chatHistoryStore";
import { useAssistant, type AssistantMessage, type Scope } from "./useAssistant";
import type { ContextConfig } from "./ContextMenu";
import type { AssistantOptions } from "@/api/chat";
import { uuid } from "@/api/ids";
import { SelectionTools } from "@/features/tools/SelectionTools";
import { QuotaBanner } from "@/features/usage/QuotaBanner";
import { getReviewPrefs, subscribeReviewPrefs } from "@/lib/prefs";
import "./assistant.css";

function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function PlusGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function AssistantView() {
  const { state, send, stop, reset, truncateBefore, loadMessages } = useAssistant();
  const [scope, setScope] = useState<Scope>("document");
  // Composer draft is owned here so the prompt library and edit-and-re-run can
  // write into it.
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  // Grounding sources the assistant draws on (US corpus + matter docs on by
  // default; web search off). Chosen via the composer's "+" context menu.
  const [context, setContext] = useState<ContextConfig>({
    web: false,
    matterDocs: true,
    corpus: true,
  });
  // Matter + jurisdiction are the user's standing context, set once in Settings.
  // The assistant reads them here instead of re-asking on every question.
  const [prefs, setPrefs] = useState(getReviewPrefs());
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  // The device-local conversation this transcript persists to. Null until the
  // first turn creates one (or a past chat is loaded).
  const convIdRef = useRef<string | null>(null);

  // Edit-and-re-run: drop the edited turn (and its stale answer), load the text
  // back into the composer, and focus it once the DOM reflects the new draft.
  function handleEdit(message: AssistantMessage) {
    truncateBefore(message.id);
    setDraft(message.content);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function newChat() {
    reset();
    convIdRef.current = null;
    setDraft("");
    setHistoryOpen(false);
  }

  function loadChat(id: string) {
    const conv = getConversation(id);
    if (!conv) return;
    convIdRef.current = id;
    loadMessages(conv.messages);
    setDraft("");
    setHistoryOpen(false);
  }

  // Persist completed turns to device-local history (never mid-stream).
  useEffect(() => {
    if (state.streaming || state.messages.length === 0) return;
    if (!convIdRef.current) convIdRef.current = uuid();
    saveConversation({
      id: convIdRef.current,
      title: deriveTitle(state.messages),
      messages: state.messages.map((m) => (m.pending ? { ...m, pending: false } : m)),
      updatedAt: Date.now(),
    });
  }, [state.messages, state.streaming]);

  useEffect(() => subscribeReviewPrefs(setPrefs), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages, state.thinking]);

  const grounding = useMemo<AssistantOptions>(
    () => ({
      matterId: prefs.matterId || null,
      enableMatterDocsSearch: prefs.matterId ? context.matterDocs : undefined,
      enableWebSearch: context.web,
      useRag: context.corpus,
      usStates: prefs.jurisdiction ? [prefs.jurisdiction] : undefined,
    }),
    [prefs.matterId, prefs.jurisdiction, context],
  );

  const empty = state.messages.length === 0;

  const canNewChat = !empty || convIdRef.current !== null;

  return (
    <div className="assistant">
      {historyOpen && (
        <ChatHistory activeId={convIdRef.current} onPick={loadChat} onClose={() => setHistoryOpen(false)} />
      )}
      <div className="assistant__bar">
        <button type="button" className="assistant__bar-btn" onClick={() => setHistoryOpen(true)}>
          <ClockGlyph /> History
        </button>
        <button
          type="button"
          className="assistant__bar-btn"
          onClick={newChat}
          disabled={!canNewChat}
        >
          <PlusGlyph /> New chat
        </button>
      </div>
      <div className="assistant__messages">
        <QuotaBanner />
        <SelectionTools />
        {empty ? (
          <div className="assistant__intro">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <h1 className="view-title">Assistant</h1>
              <InfoTip text="Ask anything about the open contract; answers are grounded in the document and US law, with sources you can check. Select text in the document first to rewrite, explain, or run a risk / compliance check on just that clause. It answers questions, it does not edit the file on its own." />
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Ask anything about the contract you have open. Answers are grounded in the document and
              US law.
            </p>
            {(prefs.jurisdiction || prefs.matterId) && (
              <p className="small muted" style={{ margin: 0 }}>
                Scoped to {prefs.jurisdiction || "all US"}
                {prefs.matterId ? " and your matter" : ""}. Change in Settings.
              </p>
            )}
            <SuggestedPrompts onPick={(p) => send(p, scope, grounding)} />
          </div>
        ) : (
          <>
            {state.messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onEdit={m.role === "user" && !state.streaming ? handleEdit : undefined}
              />
            ))}
            {state.thinking && (
              <LiveRegion className="assistant__thinking">
                <Spinner />
                <span className="small muted">{state.thinking}...</span>
              </LiveRegion>
            )}
            {state.error && <Banner tone="danger">{state.error}</Banner>}
            <div ref={endRef} />
          </>
        )}
      </div>
      <Composer
        ref={composerRef}
        value={draft}
        onChange={setDraft}
        onSend={(t) => send(t, scope, grounding)}
        onStop={stop}
        disabled={state.streaming}
        scope={scope}
        onScope={setScope}
        context={context}
        onContextChange={setContext}
        hasMatter={!!prefs.matterId}
      />
    </div>
  );
}
