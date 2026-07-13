import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, LiveRegion, Spinner } from "@/ui/primitives";
import { ChevronIcon } from "@/ui/icons";
import { MessageBubble } from "./MessageBubble";
import { Composer, type ComposerHandle, type ComposerMode } from "./Composer";
import { SuggestedPrompts, detectContractType } from "./SuggestedPrompts";
import { EditIntro } from "./EditIntro";
import { ChatHistory } from "./ChatHistory";
import {
  deriveTitle,
  getConversation,
  listConversations,
  saveConversation,
  type Conversation,
} from "./chatHistoryStore";
import { useWordSelection } from "./useWordSelection";
import { classifyIntent, type Intent } from "./intent";
import { selectClauseInDocument } from "@/office/navigate";
import { acceptAllTrackedChanges } from "@/office/changes";
import { insertCommentAnchored, deleteAllComments } from "@/office/comments";

/** Actionable (non-ask) intents that get staged for an explicit confirm. */
type ActionIntent = Exclude<Intent, { action: "ask" }>;

/** Human-readable confirm prompt for a staged action. */
function suggestLabel(i: ActionIntent): string {
  switch (i.action) {
    case "edit":
      return "This looks like an edit. Redline the document for this?";
    case "navigate":
      return `Go to "${i.target}" in the document?`;
    case "comment":
      return `Add a comment on "${i.target}"?`;
    case "accept":
      return "Accept all tracked changes? Word's Undo reverses it.";
    case "cleanCopy":
      return "Make a clean copy (accept all changes, remove comments)? Word's Undo reverses it.";
  }
}

/** Button label for a staged action. */
function suggestCta(i: ActionIntent): string {
  switch (i.action) {
    case "edit":
      return "Redline it";
    case "navigate":
      return "Take me there";
    case "comment":
      return "Add comment";
    case "accept":
      return "Accept all";
    case "cleanCopy":
      return "Make clean copy";
  }
}
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
import { formatRelativeTime } from "@/lib/relativeTime";
import { RedlineCard } from "@/features/review/RedlineCard";
import { editDocument, editToRedline } from "@/api/edit";
import { readFullDocumentText } from "@/office/document";
import { errorMessage } from "@/api/errors";
import type { RedlineSuggestion } from "@/api/types";
import type { Decision } from "@/features/review/decisions";
import type { AppIntent, SelectionToolKey } from "@/app/nav";
import "./assistant.css";

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

/** Compact relative time for the recent-chats list ("2h", "3d", else a date). */

export function AssistantView({
  intent,
  onIntentDone,
}: {
  /** A cross-feature handoff (ask this, or open a selection tool). */
  intent?: AppIntent | null;
  onIntentDone?: () => void;
} = {}) {
  const { state, send, stop, reset, truncateBefore, loadMessages } = useAssistant();
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
  // A detected document action awaiting the user's confirm (Ask-mode intent
  // routing). Null when the last message was a plain question.
  const [pendingAction, setPendingAction] = useState<{ intent: ActionIntent; text: string } | null>(
    null,
  );
  // A short "what I did" line shown after an action runs (auto-clears).
  const [actionResult, setActionResult] = useState<string | null>(null);
  useEffect(() => {
    if (!actionResult) return;
    const t = setTimeout(() => setActionResult(null), 6000);
    return () => clearTimeout(t);
  }, [actionResult]);
  const [editState, setEditState] = useState<EditState>({ status: "idle" });
  // The instruction that produced the current edit set, echoed above the cards so
  // the user sees what they asked (like a chat turn) instead of cards appearing
  // from nowhere.
  const [editInstruction, setEditInstruction] = useState("");
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

  // Edit mode: describe a change, get grounded redlines across the document.
  async function generateEdit(instruction: string) {
    const instr = instruction.trim();
    if (!instr) return;
    setEditInstruction(instr);
    setEditState({ status: "generating" });
    setEditDecisions({});
    try {
      const text = await readFullDocumentText();
      // Detect the contract type so the server can gate each edit against the
      // matching doc-type playbook (approval level + deal-breaker), like Review.
      const contractType = detectContractType(text) ?? undefined;
      const edits = await editDocument(text, instr, contractType);
      setEditState({ status: "review", redlines: edits.map(editToRedline) });
    } catch (e) {
      setEditState({
        status: "error",
        error: errorMessage(e),
      });
    }
  }

  // The composer's send routes by mode: Ask -> chat, Edit -> generate redlines.
  function handleSend(t: string) {
    if (mode === "edit") {
      void generateEdit(t);
      return;
    }
    // Ask mode: if the message is really a document action (redline / navigate),
    // offer to run it instead of just answering. Never acts silently.
    const intent = classifyIntent(t);
    if (intent.action !== "ask") {
      setPendingAction({ intent, text: t });
      return;
    }
    send(t, scope, grounding, attach.contextFiles());
  }

  // Run the confirmed action against the open document. Edit routes into the rich
  // Edit flow; the rest drive the Office helpers and report a short result.
  async function runPendingAction() {
    const pa = pendingAction;
    if (!pa) return;
    setPendingAction(null);
    setActionResult(null);
    try {
      switch (pa.intent.action) {
        case "edit":
          setMode("edit");
          void generateEdit(pa.text);
          break;
        case "navigate":
          await selectClauseInDocument(pa.intent.target);
          break;
        case "comment": {
          const r = await insertCommentAnchored(pa.intent.target, pa.intent.note);
          setActionResult(
            r === "inserted"
              ? `Comment added on "${pa.intent.target}".`
              : r === "not_found"
                ? `Could not find "${pa.intent.target}" in the document.`
                : "Word does not allow a comment in that location.",
          );
          break;
        }
        case "accept": {
          const n = await acceptAllTrackedChanges();
          setActionResult(
            `Accepted ${n} tracked change${n === 1 ? "" : "s"}. Word's Undo reverses it.`,
          );
          break;
        }
        case "cleanCopy": {
          const accepted = await acceptAllTrackedChanges();
          const removed = await deleteAllComments();
          setActionResult(
            `Clean copy ready: accepted ${accepted} change${accepted === 1 ? "" : "s"}, removed ${removed} comment${removed === 1 ? "" : "s"}. Word's Undo reverses it.`,
          );
          break;
        }
      }
    } catch (e) {
      setActionResult(errorMessage(e));
    }
  }

  // The user declined the action: answer the message as a normal question.
  function dismissToAnswer() {
    const pa = pendingAction;
    if (!pa) return;
    setPendingAction(null);
    send(pa.text, scope, grounding, attach.contextFiles());
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
        // A document-only ask (e.g. "should I accept this redline?") is answered
        // from the open document alone: turn off every external source so the
        // backend does not auto-fall-back to web / corpus retrieval. The explicit
        // enableWebSearch:false is honored server-side as a hard opt-out.
        const askGrounding: AssistantOptions = intent.documentOnly
          ? {
              useRag: false,
              matterId: null,
              enableVaquillDbSearch: false,
              enableMatterDocsSearch: false,
              enableWebSearch: false,
            }
          : grounding;
        send(intent.prompt, intent.scope ?? scope, askGrounding, attach.contextFiles());
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

  // The current Word selection (if any), so the empty state can offer to ask
  // about the highlighted clause specifically.
  const selectionText = useWordSelection();
  // Best-effort client-side contract-type guess (tailors the starter chips and
  // the Edit-mode example preview). Load it whenever a starter surface is shown:
  // the Ask empty state, or Edit mode sitting idle.
  const [docType, setDocType] = useState<string | null>(null);
  const wantDocType = empty || (mode === "edit" && editState.status === "idle");
  useEffect(() => {
    if (!wantDocType) return;
    let alive = true;
    readFullDocumentText()
      .then((text) => alive && setDocType(detectContractType(text)))
      .catch(() => alive && setDocType(null));
    return () => {
      alive = false;
    };
  }, [wantDocType]);

  // Recent conversations to resume from the empty state (excluding this one).
  const recentChats: Conversation[] = empty
    ? listConversations()
        .filter((c) => c.id !== convIdRef.current)
        .slice(0, 2)
    : [];

  // Only offer the selection when it's a meaningful span, not a stray caret/word.
  const hasSelection = selectionText.length > 20;

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
          <span className="assistant__bar-label">History</span>
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
          <span className="assistant__bar-label">New chat</span>
        </button>
      </div>
      <div className="assistant__messages" ref={scrollRef} onScroll={onMessagesScroll}>
        <QuotaBanner />
        <SelectionTools initialTool={selTool} />
        {mode === "edit" ? (
          <div className="stack" style={{ padding: "4px 0" }}>
            {editState.status === "idle" && (
              <EditIntro
                contractType={docType}
                onPick={(instruction) => {
                  setDraft(instruction);
                  requestAnimationFrame(() => composerRef.current?.focus());
                }}
              />
            )}
            {editState.status !== "idle" && editInstruction && (
              <div className="msg msg--user msg--edit-echo">
                <p>{editInstruction}</p>
              </div>
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

            {hasSelection && (
              <button
                type="button"
                className="suggest-chip assistant__sel-chip"
                onClick={() =>
                  send(
                    "Explain the selected clause: what it does, and any risk to me.",
                    "selection",
                    grounding,
                    attach.contextFiles(),
                  )
                }
              >
                <span className="suggest-chip__icon" aria-hidden>
                  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
                  </svg>
                </span>
                Ask about the selected text
              </button>
            )}

            <SuggestedPrompts
              contractType={docType}
              onPick={(p) => send(p, scope, grounding, attach.contextFiles())}
            />

            {recentChats.length > 0 && (
              <div className="assistant__recent">
                <span className="small muted assistant__recent-label">Recent</span>
                {recentChats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="assistant__recent-item"
                    onClick={() => loadChat(c.id)}
                  >
                    <span className="assistant__recent-title">{c.title}</span>
                    <span className="small muted">{formatRelativeTime(c.updatedAt)}</span>
                  </button>
                ))}
              </div>
            )}
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
                {/* Strip any trailing dots the label already carries so we never
                    render a doubled ellipsis ("...statutes......"). */}
                <span className="small muted">
                  {state.thinking.replace(/[.…\s]+$/, "")}
                  {"…"}
                </span>
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
      {pendingAction && (
        <div className="assistant__suggest">
          <span className="small assistant__suggest-text">
            {suggestLabel(pendingAction.intent)}
          </span>
          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
            <Button
              variant={
                pendingAction.intent.action === "accept" ||
                pendingAction.intent.action === "cleanCopy"
                  ? "danger"
                  : "primary"
              }
              size="sm"
              onClick={() => void runPendingAction()}
            >
              {suggestCta(pendingAction.intent)}
            </Button>
            <Button variant="ghost" size="sm" onClick={dismissToAnswer}>
              Just answer
            </Button>
          </div>
        </div>
      )}
      {!pendingAction && actionResult && (
        <div className="assistant__action-result small muted" role="status">
          {actionResult}
        </div>
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
