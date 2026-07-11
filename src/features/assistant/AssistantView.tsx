import { useEffect, useMemo, useRef, useState } from "react";
import { Banner, LiveRegion, Spinner } from "@/ui/primitives";
import { ChevronIcon } from "@/ui/icons";
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
  const { state, send, stop, reset, truncateBefore, loadMessages, regenerate } = useAssistant();
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  // Whether the transcript is scrolled to the bottom. When the user scrolls up
  // mid-stream we stop auto-following and offer a "jump to latest" pill instead
  // of yanking them back down.
  const [atBottom, setAtBottom] = useState(true);
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

  function handleRegenerate(message: AssistantMessage) {
    regenerate(message.id, scope, grounding);
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

  // Auto-follow the stream only while the user is already at the bottom; if they
  // have scrolled up to read, leave their position alone.
  useEffect(() => {
    if (atBottom) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages, state.thinking, atBottom]);

  function onMessagesScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distance < 48);
  }

  function jumpToLatest() {
    setAtBottom(true);
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }

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
        <button
          type="button"
          className="assistant__bar-btn"
          onClick={() => setHistoryOpen(true)}
          aria-label="Chat history"
          title="History"
        >
          <ClockGlyph />
        </button>
        <button
          type="button"
          className="assistant__bar-btn"
          onClick={newChat}
          disabled={!canNewChat}
          aria-label="New chat"
          title="New chat"
        >
          <PlusGlyph />
        </button>
      </div>
      <div className="assistant__messages" ref={scrollRef} onScroll={onMessagesScroll}>
        <QuotaBanner />
        <SelectionTools />
        {empty ? (
          <div className="assistant__intro">
            <div className="assistant__greeting">
              <p className="assistant__greeting-title">Ask anything about the open contract.</p>
              <p className="assistant__greeting-sub">
                Grounded in the document and US law, with sources you can check.
              </p>
              {(prefs.jurisdiction || prefs.matterId) && (
                <p className="assistant__greeting-scope">
                  Scoped to {prefs.jurisdiction || "all US"}
                  {prefs.matterId ? " and your matter" : ""}. Change in Settings.
                </p>
              )}
            </div>
            <SuggestedPrompts onPick={(p) => send(p, scope, grounding)} />
          </div>
        ) : (
          <>
            {state.messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onEdit={m.role === "user" && !state.streaming ? handleEdit : undefined}
                onRegenerate={
                  m.role === "assistant" && !state.streaming ? handleRegenerate : undefined
                }
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
      {!empty && !atBottom && (
        <button
          type="button"
          className="assistant__jump"
          onClick={jumpToLatest}
          aria-label="Jump to latest"
          title="Jump to latest"
        >
          <ChevronIcon size={16} />
        </button>
      )}
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
