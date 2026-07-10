import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Header } from "./ui/Header";
import { Badge, Banner, Button } from "./ui/primitives";
import { SetupSummary } from "./features/review/SetupSummary";
import { ReviewToolbar, type RedlineFilter } from "./features/review/ReviewToolbar";
import { SignoffGate } from "./features/review/SignoffGate";
import { ReviewSummary } from "./features/review/ReviewSummary";
import { RedlineCard } from "./features/review/RedlineCard";
import { DocumentTools } from "./features/review/DocumentTools";
import { OutlinePanel } from "./features/review/OutlinePanel";
import { SaveToVaquill } from "./features/integration/SaveToVaquill";
import { useDecisions } from "./features/review/decisions";
import { ReviewIcon, DraftIcon, AssistantIcon, PlaybookIcon } from "./ui/icons";
import { InfoTip } from "./ui/InfoTip";
import { severityOf } from "./lib/severity";
import { SelectionPreview } from "./features/tools/SelectionPreview";
import { RewriteTool } from "./features/tools/RewriteTool";
import { ExplainTool } from "./features/tools/ExplainTool";
import type { ContractReviewResponse } from "./api/types";
import "./styles/global.css";
import "./styles/app.css";
import "./features/review/review.css";
import "./features/tools/tools.css";

/**
 * Static UI preview harness. Renders the redesigned review results with mock
 * data and no Office dependency, so the layout, motion, and states can be
 * inspected in a plain browser. Not shipped in the add-in itself.
 */
const RESULT: ContractReviewResponse = {
  id: "demo",
  summary:
    "This mutual NDA is broadly reasonable, but the confidentiality term is indefinite and the governing law favors the counterparty. Three clauses need attention before you sign.",
  overallRisk: "yellow",
  contractType: "nda",
  userSide: "customer",
  redlines: [
    {
      clauseName: "Term of Confidentiality",
      sectionReference: "Section 4.2",
      currentLanguage: "The obligations of confidentiality shall survive in perpetuity.",
      proposedLanguage:
        "The obligations of confidentiality shall survive for three (3) years following termination.",
      rationale: "Perpetual confidentiality is hard to administer. Market standard is 2 to 5 years.",
      grounding: "verified",
      approvalLevel: "manager",
      isDealBreaker: false,
    },
    {
      clauseName: "Governing Law",
      sectionReference: "Section 9.1",
      currentLanguage: "This Agreement shall be governed by the laws of the State of New York.",
      proposedLanguage: "This Agreement shall be governed by the laws of the State of Delaware.",
      rationale: "Counterparty-favorable jurisdiction. Delaware is the neutral default for your side.",
      grounding: "verified",
      approvalLevel: "partner",
      isDealBreaker: true,
    },
    {
      clauseName: "Mutual Indemnification",
      currentLanguage: "",
      proposedLanguage:
        "Each party shall indemnify the other against third-party claims arising from its breach of this Agreement.",
      rationale: "The agreement lacks a mutual indemnification clause.",
      grounding: "insertion",
      approvalLevel: "none",
      isDealBreaker: false,
    },
    {
      clauseName: "Limitation of Liability",
      currentLanguage: "In no event shall the Disclosing Party be liable for any damages whatsoever.",
      proposedLanguage:
        "Neither party shall be liable for indirect or consequential damages; direct damages are capped at fees paid.",
      rationale: "One-sided liability waiver. Should be mutual and capped.",
      grounding: "unverified",
      approvalLevel: "none",
      isDealBreaker: false,
    },
  ],
  negotiationPriorities: [
    { tier: 1, tierLabel: "Must-have", items: ["Change governing law to Delaware", "Add mutual indemnification"] },
    { tier: 2, tierLabel: "Should-have", items: ["Cap confidentiality term at three years"] },
  ],
  missingClauses: ["Indemnification", "Assignment"],
  approvalGate: {
    required: true,
    level: "partner",
    dealBreakerCount: 1,
    reasons: [{ clauseName: "Governing Law", reason: "Counterparty-favorable jurisdiction" }],
    summary: "This deal needs partner sign-off before sending, due to the governing-law change and one deal-breaker.",
  },
};

function Preview() {
  const { decisionOf, setDecision, addressed } = useDecisions("demo");
  const [filter, setFilter] = useState<RedlineFilter>("all");
  const redlines = RESULT.redlines;

  const counts = useMemo(
    () => ({
      all: redlines.length,
      high: redlines.filter((r) => severityOf(r) === "high").length,
      unresolved: redlines.filter((_, i) => decisionOf(i) === "pending").length,
    }),
    [redlines, decisionOf],
  );
  const visible = redlines
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => {
      if (filter === "high") return severityOf(r) === "high";
      if (filter === "unresolved") return decisionOf(i) === "pending";
      return true;
    });

  return (
    <div className="app">
      <Header right={<Button variant="ghost" size="sm">Sign out</Button>} />
      <nav className="tabnav">
        {[
          { l: "Review", I: ReviewIcon, on: true },
          { l: "Draft", I: DraftIcon, on: false },
          { l: "Assistant", I: AssistantIcon, on: false },
          { l: "Playbook", I: PlaybookIcon, on: false },
        ].map((t) => (
          <button key={t.l} className={`tabnav__tab ${t.on ? "tabnav__tab--on" : ""}`}>
            <t.I size={15} />
            {t.l}
          </button>
        ))}
      </nav>
      <div className="subnav">
        <div className="seg" role="tablist">
          <button className="seg__btn seg__btn--on">Redlines</button>
          <button className="seg__btn">Changes</button>
          <button className="seg__btn">Citations</button>
          <button className="seg__btn">Sign-off</button>
        </div>
      </div>
      <div className="app-body">
        <div className="review review--results">
          <div className="review__header">
            <SetupSummary parts={["NDA", "Customer", "Delaware"]} onNew={() => {}} />
            <div className="signoff-pill">
              <Badge tone="red">Partner sign-off</Badge>
            </div>
            <ReviewToolbar
              total={redlines.length}
              addressed={addressed}
              filter={filter}
              onFilter={setFilter}
              counts={counts}
            />
          </div>
          <div className="review__body">
            <SignoffGate gate={RESULT.approvalGate!} />
            <ReviewSummary result={RESULT} />
            <OutlinePanel />
            <DocumentTools redlines={RESULT.redlines} />
            <SaveToVaquill mode="review" redlines={RESULT.redlines} title="NDA (reviewed)" />
            {visible.length === 0 ? (
              <Banner tone="info">Everything here is addressed.</Banner>
            ) : (
              <div className="stack">
                {visible.map(({ r, i }) => (
                  <RedlineCard key={i} redline={r} index={i} decision={decisionOf(i)} onDecision={setDecision} />
                ))}
              </div>
            )}
          </div>
          <div className="action-bar">
            <div className="action-bar__row">
              <Button variant="primary" block>
                Apply all open (2)
              </Button>
              <Button variant="default" block>
                Download .docx
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolsPreview() {
  const [tab, setTab] = useState<"rewrite" | "explain">("rewrite");
  const clause =
    "In no event shall the Disclosing Party be liable for any damages whatsoever arising out of this Agreement.";
  return (
    <div className="app">
      <Header right={<Button variant="ghost" size="sm">Sign out</Button>} />
      <nav className="tabnav">
        <button className="tabnav__tab">Review</button>
        <button className="tabnav__tab tabnav__tab--on">Clause tools</button>
      </nav>
      <div className="app-body">
        <div className="stack tools">
          <div className="stack" style={{ gap: 4 }}>
            <h1 style={{ fontSize: 15 }}>Clause tools</h1>
            <p className="small muted" style={{ margin: 0 }}>
              Rewrite or explain whatever you have selected in the document.
            </p>
          </div>
          <SelectionPreview text={clause} words={18} hasSelection loading={false} />
          <div className="seg" role="tablist">
            <button
              className={`seg__btn ${tab === "rewrite" ? "seg__btn--on" : ""}`}
              onClick={() => setTab("rewrite")}
            >
              Rewrite
            </button>
            <button
              className={`seg__btn ${tab === "explain" ? "seg__btn--on" : ""}`}
              onClick={() => setTab("explain")}
            >
              Explain
            </button>
          </div>
          {tab === "rewrite" ? <RewriteTool clauseText={clause} /> : <ExplainTool clauseText={clause} />}
        </div>
      </div>
    </div>
  );
}

import { AuthorityItem } from "./features/authority/AuthorityItem";
import type { AuthorityResult } from "./api/authority";
import "./features/authority/authority.css";

const AUTHORITIES: AuthorityResult[] = [
  { raw: "347 U.S. 483", count: 1, verdict: "verified", caseName: "Brown v. Board of Education", court: "Supreme Court", year: "1954" },
  { raw: "384 U.S. 436", count: 3, verdict: "verified", caseName: "Miranda v. Arizona", court: "Supreme Court", year: "1966" },
  { raw: "550 U.S. 544", count: 2, verdict: "verified", caseName: "Bell Atlantic Corp. v. Twombly", court: "Supreme Court", year: "2007" },
  { raw: "999 F.3d 1234", count: 1, verdict: "no_match" },
  { raw: "123 N.E.2d 456", count: 1, verdict: "unrecognized" },
];

function AuthorityPreview() {
  const verified = AUTHORITIES.filter((r) => r.verdict === "verified").length;
  return (
    <div className="app">
      <Header right={<Button variant="ghost" size="sm">Sign out</Button>} />
      <nav className="tabnav">
        <button className="tabnav__tab">Review</button>
        <button className="tabnav__tab tabnav__tab--on">Authority</button>
        <button className="tabnav__tab">Clause tools</button>
      </nav>
      <div className="app-body">
        <div className="stack authority-view">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <h1 style={{ fontSize: 15 }}>Authority check</h1>
              <InfoTip side="left" text="Checks every case citation in the document against Vaquill AI's US case-law corpus. Verified means a real matching case was found. No match can mean a hallucinated, mis-typed, or unreported citation, so confirm it yourself before you rely on it or file." />
            </div>
            <Button variant="ghost" size="sm">New check</Button>
          </div>
          <div className="authority-summary">
            <Badge tone="green">{verified} verified</Badge>
            <Badge tone="red">1 no match</Badge>
            <Badge tone="neutral">1 unresolved</Badge>
          </div>
          <div className="stack">
            {AUTHORITIES.map((r) => (
              <AuthorityItem key={r.raw} result={r} />
            ))}
          </div>
          <Button variant="default" block>
            Insert Table of Authorities ({verified})
          </Button>
        </div>
      </div>
    </div>
  );
}

import { MessageBubble } from "./features/assistant/MessageBubble";
import { Composer } from "./features/assistant/Composer";
import type { AssistantMessage } from "./features/assistant/useAssistant";
import "./features/assistant/assistant.css";

const CONVO: AssistantMessage[] = [
  { id: "u1", role: "user", content: "What are the top 3 legal risks in this NDA?" },
  {
    id: "a1",
    role: "assistant",
    content:
      "Here are the three highest-priority risks from your side:\n\n- **Perpetual confidentiality.** Section 4.2 has no end date, which is hard to administer. Market standard is 2 to 5 years.\n- **Governing law favors the counterparty.** Section 9.1 selects New York; Delaware is the neutral default for your side.\n- **One-sided liability waiver.** The Disclosing Party is shielded from all damages, with no mutual cap.\n\nThe confidentiality term and governing law are the two worth pushing on first.",
    sources: [
      { caseName: "Restatement (Second) of Contracts 188" },
      { caseName: "17 U.S.C. 107" },
    ],
  },
];

function AssistantPreview() {
  const [scope, setScope] = useState<"document" | "selection">("document");
  return (
    <div className="app">
      <Header right={<Button variant="ghost" size="sm">Sign out</Button>} />
      <nav className="tabnav">
        <button className="tabnav__tab">Review</button>
        <button className="tabnav__tab tabnav__tab--on">Assistant</button>
        <button className="tabnav__tab">Authority</button>
        <button className="tabnav__tab">Tools</button>
      </nav>
      <div className="app-body">
        <div className="assistant">
          <div className="assistant__messages">
            {CONVO.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </div>
          <Composer onSend={() => {}} disabled={false} scope={scope} onScope={setScope} />
        </div>
      </div>
    </div>
  );
}

import "./features/governance/governance.css";

function GovTabs({ active }: { active: string }) {
  return (
    <nav className="tabnav">
      {["Review", "Assistant", "Authority", "Tools", "Sign-off"].map((t) => (
        <button key={t} className={`tabnav__tab ${t === active ? "tabnav__tab--on" : ""}`}>
          {t}
        </button>
      ))}
    </nav>
  );
}

function GovernancePreview() {
  return (
    <div className="app">
      <Header right={<Button variant="ghost" size="sm">Sign out</Button>} />
      <GovTabs active="Sign-off" />
      <div className="app-body">
        <div className="stack governance-view">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h1 style={{ fontSize: 15 }}>Sign-off</h1>
            <Badge tone="green">Integrity verified</Badge>
          </div>
          <div className="gov-banner gov-banner--pending">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>Sign-off required before sending</strong>
              <Badge tone="red">Partner sign-off</Badge>
            </div>
            <p className="small" style={{ margin: "6px 0 0" }}>
              This deal needs partner sign-off before sending, due to the governing-law change and one deal-breaker.
            </p>
          </div>
          <div className="gov-meta small muted">
            <div>Reviewed by gc@acme.com</div>
            <div>on Jul 9, 2026, 06:12 PM</div>
            <div>Contract type: nda</div>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <h2 className="small muted">Why sign-off is needed</h2>
            <ul className="gov-reasons small">
              <li><strong>Governing Law: </strong>Counterparty-favorable jurisdiction</li>
            </ul>
          </div>
          <div className="card gov-action stack">
            <div className="field">
              <label>Add a note (optional)</label>
              <textarea placeholder="e.g. Approved the New York to Delaware change." />
            </div>
            <Button variant="primary" block>Record my sign-off</Button>
            <p className="small muted" style={{ margin: 0 }}>
              Your sign-off is stamped into the document and travels with the file.
            </p>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <h2 className="small muted">History</h2>
            <ol className="gov-history">
              <li>
                <span className="gov-history__dot" aria-hidden />
                <div>
                  <div className="small"><strong>Review recorded</strong> by gc@acme.com</div>
                  <div className="small muted">Jul 9, 2026, 06:12 PM</div>
                  <div className="small gov-history__note">partner sign-off required</div>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

import { LadderCard } from "./features/playbook/LadderCard";
import type { PlaybookPosition } from "./api/playbooks";
import "./features/playbook/playbook.css";

const POSITIONS: Record<string, PlaybookPosition> = {
  limitation_of_liability: {
    standardPosition:
      "Liability is capped at 12 months' fees, with no cap for IP indemnity, breach of confidentiality, or gross negligence.",
    acceptableRange: "12 months' fees up to 3x annual fees, carve-outs preserved.",
    escalationTriggers: ["Cap below 12 months' fees", "Carve-outs removed"],
    fallbackLadder: [
      "Cap at 18 months' fees, carve-outs preserved.",
      "Cap at 2x annual fees.",
      "Mutual cap at 3x annual fees.",
    ],
    dealBreaker: "Uncapped liability, or a cap below 12 months' fees.",
    priority: "must_have",
  },
  governing_law: {
    standardPosition: "Delaware law, exclusive jurisdiction of the Delaware courts.",
    fallbackLadder: ["New York law and courts.", "Counterparty's home state, if mutual."],
    dealBreaker: "A jurisdiction with no nexus to either party.",
    priority: "should_have",
  },
};

function PlaybookPreview() {
  return (
    <div className="app">
      <Header right={<Button variant="ghost" size="sm">Sign out</Button>} />
      <nav className="tabnav">
        {["Review", "Assistant", "Authority", "Tools", "Playbook", "Sign-off"].map((t) => (
          <button key={t} className={`tabnav__tab ${t === "Playbook" ? "tabnav__tab--on" : ""}`}>
            {t}
          </button>
        ))}
      </nav>
      <div className="app-body">
        <div className="stack playbook-view">
          <div className="stack" style={{ gap: 4 }}>
            <h1 style={{ fontSize: 15 }}>Playbook</h1>
            <p className="small muted" style={{ margin: 0 }}>
              Insert your preferred position, or step down the fallback ladder, as a tracked change.
            </p>
          </div>
          <input className="playbook-filter" placeholder="Filter clauses..." />
          <div className="stack">
            {Object.entries(POSITIONS).map(([k, p]) => (
              <LadderCard key={k} clauseType={k} position={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import "./features/draft/draft.css";

const DRAFT_TABS = ["Review", "Assistant", "Draft", "Authority", "Tools", "Playbook", "Sign-off"];
const DRAFT_TEXT = `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement (this "Agreement") is entered into as of the Effective Date by and between Acme Inc., a Delaware corporation ("Acme"), and Beta LLC, a Delaware limited liability company ("Beta").

1. Confidential Information. "Confidential Information" means any non-public information disclosed by one party to the other, whether orally, in writing, or by inspection of tangible objects.

2. Obligations. Each party shall (a) hold the other's Confidential Information in strict confidence, and (b) not disclose it to any third party without prior written consent.

3. Term. The obligations of confidentiality shall survive for three (3) years following termination of this Agreement.

4. Governing Law. This Agreement shall be governed by the laws of the State of Delaware.`;

function DraftPreview() {
  return (
    <div className="app">
      <Header right={<Button variant="ghost" size="sm">Sign out</Button>} />
      <nav className="tabnav">
        {DRAFT_TABS.map((t) => (
          <button key={t} className={`tabnav__tab ${t === "Draft" ? "tabnav__tab--on" : ""}`}>
            {t}
          </button>
        ))}
      </nav>
      <div className="app-body">
        <div className="stack draft-view">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h1 style={{ fontSize: 15 }}>Draft</h1>
            <Button variant="ghost" size="sm">New draft</Button>
          </div>
          <h2 style={{ fontSize: 14 }}>Mutual NDA - Acme and Beta</h2>
          <div className="stack" style={{ gap: 2 }}>
            <h3 className="small muted">Sections</h3>
            <ol className="draft-outline small">
              <li>Confidential Information</li>
              <li>Obligations</li>
              <li>Term</li>
              <li>Governing Law</li>
            </ol>
          </div>
          <div className="draft-preview">{DRAFT_TEXT}</div>
          <div className="draft-actions">
            <Button variant="primary" block>Insert into document</Button>
            <Button variant="default">Copy</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { IconButton } from "./ui/primitives";
import { LocateIcon, CheckIcon, XIcon } from "./ui/icons";

const CHANGES = [
  { type: "added", author: "Counsel B", text: "Each party shall indemnify the other against third-party IP claims.", verdict: "accept", reason: "Mutual, aligns with our playbook." },
  { type: "deleted", author: "Counsel B", text: "Liability is capped at 12 months' fees.", verdict: "reject", reason: "Removes our liability cap; deal-breaker." },
  { type: "added", author: "Counsel B", text: "Either party may terminate for convenience on 30 days' notice.", verdict: "review", reason: "New termination right; needs a human." },
];

function verdictBadgeP(v: string) {
  if (v === "accept") return <Badge tone="green">Accept</Badge>;
  if (v === "reject") return <Badge tone="red">Reject</Badge>;
  return <Badge tone="yellow">Review</Badge>;
}
function typeBadgeP(t: string) {
  if (t === "added") return <Badge tone="green">Added</Badge>;
  if (t === "deleted") return <Badge tone="red">Deleted</Badge>;
  return <Badge tone="neutral">Change</Badge>;
}

function ChangesPreview() {
  return (
    <div className="app">
      <Header right={<Button variant="ghost" size="sm">Sign out</Button>} />
      <nav className="tabnav">
        {[{ l: "Review", I: ReviewIcon, on: true }, { l: "Draft", I: DraftIcon, on: false }, { l: "Assistant", I: AssistantIcon, on: false }, { l: "Playbook", I: PlaybookIcon, on: false }].map((t) => (
          <button key={t.l} className={`tabnav__tab ${t.on ? "tabnav__tab--on" : ""}`}><t.I size={15} />{t.l}</button>
        ))}
      </nav>
      <div className="subnav">
        <div className="seg" role="tablist">
          <button className="seg__btn">Redlines</button>
          <button className="seg__btn seg__btn--on">Changes</button>
          <button className="seg__btn">Citations</button>
          <button className="seg__btn">Sign-off</button>
        </div>
      </div>
      <div className="app-body">
        <div className="stack changes-view">
          <div className="stack" style={{ gap: 4 }}>
            <h1 style={{ fontSize: 15 }}>Counterparty changes</h1>
            <p className="small muted" style={{ margin: 0 }}>Triage the other side's tracked changes: accept the acceptable ones, reject the rest.</p>
          </div>
          <div className="field">
            <label>Triage against</label>
            <select><option>Standard SaaS playbook</option></select>
          </div>
          <Button variant="primary" block>Re-run AI triage</Button>
          <div className="triage-summary">
            <span className="small muted">AI: 1 accept - 1 review - 1 reject</span>
            <Button variant="default" size="sm"><CheckIcon size={13} /> Accept the 1 approved</Button>
          </div>
          <div className="stack">
            {CHANGES.map((c, i) => (
              <div key={i} className="card change-item">
                <div className="change-item__head">
                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>{typeBadgeP(c.type)}{verdictBadgeP(c.verdict)}</div>
                  <IconButton label="Find" onClick={() => {}}><LocateIcon size={13} /></IconButton>
                </div>
                <p className="change-item__text"><strong>{c.author}: </strong>{c.text}</p>
                <p className="small muted" style={{ margin: 0 }}>{c.reason}</p>
                <div className="row" style={{ gap: 8 }}>
                  <Button variant="primary" size="sm"><CheckIcon size={13} /> Accept</Button>
                  <Button variant="default" size="sm"><XIcon size={13} /> Reject</Button>
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="default" block>Accept all</Button>
            <Button variant="default" block>Reject all</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const hash = window.location.hash;
const view =
  hash === "#tools" ? <ToolsPreview /> : hash === "#authority" ? <AuthorityPreview /> : hash === "#assistant" ? <AssistantPreview /> : hash === "#signoff" ? <GovernancePreview /> : hash === "#playbook" ? <PlaybookPreview /> : hash === "#draft" ? <DraftPreview /> : hash === "#changes" ? <ChangesPreview /> : <Preview />;
createRoot(document.getElementById("root")!).render(view);
