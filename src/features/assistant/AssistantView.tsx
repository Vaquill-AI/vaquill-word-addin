import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, LiveRegion, Spinner } from "@/ui/primitives";
import { ChevronIcon } from "@/ui/icons";
import { MessageBubble } from "./MessageBubble";
import { Composer, type ComposerHandle, type ComposerMode } from "./Composer";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { ChatHistory } from "./ChatHistory";
import { deriveTitle, getConversation, saveConversation } from "./chatHistoryStore";
import { useAssistant, type AssistantMessage, type Scope } from "./useAssistant";
import { useAttachments } from "./useAttachments";
import { extractFileText } from "@/api/context";
import { ocrToText, isOcrEligible } from "@/api/ocr";
import type { ContextConfig } from "./ContextMenu";
import type { AssistantOptions } from "@/api/chat";
import { uuid } from "@/api/ids";
import { SelectionTools } from "@/features/tools/SelectionTools";
import { QuotaBanner } from "@/features/usage/QuotaBanner";
import { getReviewPrefs, subscribeReviewPrefs } from "@/lib/prefs";
import { RedlineCard } from "@/features/review/RedlineCard";
import { editDocument, type EditItem } from "@/api/edit";
import { readFullDocumentText } from "@/office/document";
import { ApiError, friendlyMessage } from "@/api/errors";
import type { RedlineSuggestion } from "@/api/types";
import type { Decision } from "@/features/review/decisions";
import type { AppIntent, SelectionToolKey } from "@/app/nav";
import "./assistant.css";

/** Map a backend edit to the RedlineSuggestion the review card renders + applies.
 *  The backend verified current_language is a literal substring, so grounding is
 *  "verified" (the card can apply it in place). Mirrors EditView. */
function toRedline(e: EditItem): RedlineSuggestion {
  return {
    clauseName: e.label,
    sectionReference: e.sectionReference || undefined,
    currentLanguage: e.currentLanguage,
    proposedLanguage: e.proposedLanguage,
    rationale: e.rationale,
    grounding: "verified",
    isDealBreaker: false,
  };
}

type EditState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "review"; redlines: RedlineSuggestion[] }
  | { status: "error"; error: string };

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

export function AssistantView({
  intent,
  onIntentDone,
}: {
  /** A cross-feature handoff (ask this, or open a selection tool). */
  intent?: AppIntent | null;
  onIntentDone?: () => void;
} = {}) {
  const { state, send, stop, reset, truncateBefore, loadMessages, regenerate } = useAssistant();
  // Chat attaches files as inline context: extract the text server-side and fold
  // it into the request context at send time.
  const attach = useAttachments(
    useCallback(async (file) => {
      const r = await extractFileText(file);
      // A scanned PDF extracts to nothing. Flag it so the user can opt into OCR
      // from the chip, rather than silently attaching an empty (useless) file.
      if (!r.text.trim() && isOcrEligible(file.name)) return { needsOcr: true };
      return { text: r.text, chars: r.chars, truncated: r.truncated };
    }, []),
    // Opt-in OCR resolver: recover the text on demand for a scanned attachment.
    useCallback(async (file: File) => {
      const text = await ocrToText(file);
      return { text, chars: text.length, truncated: false };
    }, []),
  );
  const [scope, setScope] = useState<Scope>("document");
  // Ask (grounded chat) vs Edit (describe a change, get grounded redlines). The
  // tabs live in the composer so switching never leaves the input.
  const [mode, setMode] = useState<ComposerMode>("ask");
  const [editState, setEditState] = useState<EditState>({ status: "idle" });
  const [editDecisions, setEditDecisions] = useState<Record<number, Decision>>({});
  const editDecisionOf = (i: number): Decision => editDecisions[i] ?? "pending";
  const setEditDecision = (i: number, d: Decision) =>
    setEditDecisions((p) => ({ ...p, [i]: d }));
  // A selection tool the shell asked us to open (Explain / Risk / Rewrite ...).
  const [selTool, setSelTool] = useState<SelectionToolKey | undefined>(undefined);
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
    regenerate(message.id, scope, grounding, attach.contextFiles());
  }

  // Edit mode: describe a change, get grounded redlines across the document.
  async function generateEdit(instruction: string) {
    const instr = instruction.trim();
    if (!instr) return;
    setEditState({ status: "generating" });
    setEditDecisions({});
    try {
      const text = await readFullDocumentText();
      const edits = await editDocument(text, instr);
      setEditState({ status: "review", redlines: edits.map(toRedline) });
    } catch (e) {
      setEditState({
        status: "error",
        error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
      });
    }
  }

  // The composer's send routes by mode: Ask -> chat, Edit -> generate redlines.
  function handleSend(t: string) {
    if (mode === "edit") {
      void generateEdit(t);
      return;
    }
    send(t, scope, grounding, attach.contextFiles());
  }

  // Switching mode clears the shared draft so leftover text from one mode does
  // not read as input for the other.
  function switchMode(next: ComposerMode) {
    setMode(next);
    setDraft("");
  }

  function newChat() {
    reset();
    attach.clear();
    convIdRef.current = null;
    setDraft("");
    setHistoryOpen(false);
  }

  function loadChat(id: string) {
    const conv = getConversation(id);
    if (!conv) return;
    convIdRef.current = id;
    loadMessages(conv.messages);
    attach.clear();
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

  const grounding = useMemo<AssistantOptions>(() => {
    const wantMatterDocs = !!prefs.matterId && context.matterDocs;
    // useRag is the backend master gate for ALL retrieval; turn it on if ANY
    // source is selected, then let the per-source levers decide what's used.
    // (Overloading useRag as the corpus toggle silently disabled matter-docs and
    // web retrieval whenever "US case law" was unticked.)
    return {
      matterId: prefs.matterId || null,
      useRag: context.corpus || wantMatterDocs || context.web,
      enableVaquillDbSearch: context.corpus,
      enableMatterDocsSearch: prefs.matterId ? context.matterDocs : undefined,
      enableWebSearch: context.web,
      usStates: prefs.jurisdiction ? [prefs.jurisdiction] : undefined,
    };
  }, [prefs.matterId, prefs.jurisdiction, context]);

  // Consume a cross-feature handoff exactly once.
  useEffect(() => {
    if (!intent) return;
    // Any handoff (ask this / open a selection tool) is a chat action.
    if (intent.kind === "assistantAsk" || intent.kind === "selectionTool") setMode("ask");
    if (intent.kind === "assistantAsk") {
      if (intent.scope) setScope(intent.scope);
      if (intent.prompt) setDraft(intent.prompt);
      if (intent.autoSend && intent.prompt.trim()) {
        send(intent.prompt, intent.scope ?? scope, grounding, attach.contextFiles());
        setDraft("");
      } else {
        requestAnimationFrame(() => composerRef.current?.focus());
      }
      onIntentDone?.();
    } else if (intent.kind === "selectionTool") {
      setSelTool(intent.tool);
      onIntentDone?.();
    }
    // grounding/scope are read at fire time; we intentionally key only on intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

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
        <SelectionTools initialTool={selTool} />
        {mode === "edit" ? (
          <div className="stack" style={{ padding: "4px 0" }}>
            {editState.status === "idle" && (
              <p className="small muted" style={{ margin: 0 }}>
                Describe a change; get grounded redlines to accept or reject.
              </p>
            )}
            {editState.status === "generating" && (
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <Spinner />
                <LiveRegion>
                  <span className="small muted">Reading the document and drafting edits...</span>
                </LiveRegion>
              </div>
            )}
            {editState.status === "error" && <Banner tone="danger">{editState.error}</Banner>}
            {editState.status === "review" &&
              (editState.redlines.length === 0 ? (
                <Banner tone="info">
                  No grounded edits were proposed for that instruction. Try being more specific.
                </Banner>
              ) : (
                <div className="stack">
                  <span className="small muted">
                    {editState.redlines.length} proposed edit
                    {editState.redlines.length === 1 ? "" : "s"}
                  </span>
                  {editState.redlines.map((r, i) => (
                    <RedlineCard
                      key={`${r.clauseName}-${i}`}
                      redline={r}
                      index={i}
                      decision={editDecisionOf(i)}
                      onDecision={setEditDecision}
                    />
                  ))}
                </div>
              ))}
          </div>
        ) : empty ? (
          <div className="assistant__intro">
            <div className="assistant__greeting">
              <p className="assistant__greeting-title">Ask anything about the open contract.</p>
              <p className="assistant__greeting-sub">
                Grounded in your document and US law, with checkable sources.
              </p>
            </div>
            <SuggestedPrompts onPick={(p) => send(p, scope, grounding, attach.contextFiles())} />
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
      {mode === "ask" && !empty && !atBottom && (
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
        onSend={handleSend}
        onStop={stop}
        disabled={mode === "edit" ? editState.status === "generating" : state.streaming}
        mode={mode}
        onMode={switchMode}
        scope={scope}
        onScope={setScope}
        context={context}
        onContextChange={setContext}
        hasMatter={!!prefs.matterId}
        attachments={attach.files}
        onAttach={attach.add}
        onRemoveAttachment={attach.remove}
        onOcrAttachment={attach.ocr}
        atCap={attach.atCap}
      />
    </div>
  );
}
