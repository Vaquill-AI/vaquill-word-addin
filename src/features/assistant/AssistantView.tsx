import { useEffect, useRef, useState } from "react";
import { Banner, Spinner } from "@/ui/primitives";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { useAssistant, type Scope } from "./useAssistant";
import "./assistant.css";

export function AssistantView() {
  const { state, send } = useAssistant();
  const [scope, setScope] = useState<Scope>("document");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages, state.thinking]);

  const empty = state.messages.length === 0;

  return (
    <div className="assistant">
      <div className="assistant__messages">
        {empty ? (
          <div className="assistant__intro">
            <h1 style={{ fontSize: 15 }}>Assistant</h1>
            <p className="small muted" style={{ margin: 0 }}>
              Ask anything about the contract you have open. Answers are grounded in the document and
              US law.
            </p>
            <SuggestedPrompts onPick={(p) => send(p, scope)} />
          </div>
        ) : (
          <>
            {state.messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {state.thinking && (
              <div className="assistant__thinking">
                <Spinner />
                <span className="small muted">{state.thinking}...</span>
              </div>
            )}
            {state.error && <Banner tone="danger">{state.error}</Banner>}
            <div ref={endRef} />
          </>
        )}
      </div>
      <Composer onSend={(t) => send(t, scope)} disabled={state.streaming} scope={scope} onScope={setScope} />
    </div>
  );
}
