import { useEffect, useRef, useState } from "react";
import { Banner, LiveRegion, Spinner } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { useAssistant, type Scope } from "./useAssistant";
import { SelectionTools } from "@/features/tools/SelectionTools";
import "./assistant.css";

export function AssistantView() {
  const { state, send, stop } = useAssistant();
  const [scope, setScope] = useState<Scope>("document");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages, state.thinking]);

  const empty = state.messages.length === 0;

  return (
    <div className="assistant">
      <div className="assistant__messages">
        <SelectionTools />
        {empty ? (
          <div className="assistant__intro">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <h1 className="view-title">Assistant</h1>
              <InfoTip text="Ask anything about the open contract; answers are grounded in the document and US law, with sources you can check. Select text in the document first to rewrite or explain just that clause. It answers questions, it does not edit the file on its own." />
            </div>
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
        onSend={(t) => send(t, scope)}
        onStop={stop}
        disabled={state.streaming}
        scope={scope}
        onScope={setScope}
      />
    </div>
  );
}
