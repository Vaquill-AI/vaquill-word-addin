/**
 * Prompt pack for the community edition.
 *
 * Each builder returns a { system, user } pair the local shim runs through the
 * user's provider. The system prompts embed the exact JSON contract each add-in
 * feature expects, so the client-side result matches the backend response shape.
 * These mirror the backend legal-tools / drafting / guideline / citation-style
 * services; they are intentionally kept short and deterministic.
 */
export interface Prompt2 {
  system: string;
  user: string;
}

const GROUNDING =
  "You are Vaquill, a careful US legal assistant embedded in Microsoft Word. " +
  "Be precise. Never invent citations, statutes, case names, or dates. " +
  "If something is not determinable from the text provided, say so rather than guessing.";

const JSON_ONLY = "Respond with ONLY a single valid JSON object matching the schema. No prose, no markdown code fences.";

/** Grounded assistant chat over the open document (streamed). */
export function assistantSystem(context: string): string {
  const doc = context && context.trim()
    ? `\n\nThe user has a document open in Word. Ground your answer in it and quote it where relevant:\n"""\n${context.slice(0, 400_000)}\n"""`
    : "\n\nThe user has no document text attached; answer from general knowledge and say when you are unsure.";
  return `${GROUNDING} Answer the lawyer's question clearly and directly.${doc}`;
}

export function rewritePrompt(
  clause: string,
  instruction: string,
  mode: string,
  tone: string,
  jurisdiction: string,
): Prompt2 {
  return {
    system:
      `${GROUNDING} Rewrite the clause per the instruction, mode (${mode}) and tone (${tone}) for ${jurisdiction}. ` +
      `Preserve legal meaning unless asked to change it. ${JSON_ONLY} ` +
      `Schema: {"original": string, "rewritten": string, "changesSummary": string}.`,
    user: `Instruction: ${instruction}\n\nClause:\n${clause}`,
  };
}

export function explainPrompt(clause: string, jurisdiction: string): Prompt2 {
  return {
    system:
      `${GROUNDING} Explain the clause for ${jurisdiction}. ${JSON_ONLY} ` +
      `Schema: {"explanation": string, "keyObligations": string[], "risks": string[], "applicableActs": string[]}. ` +
      `Leave applicableActs empty unless you are certain of a specific statute.`,
    user: clause,
  };
}

export function plainEnglishPrompt(text: string): Prompt2 {
  return {
    system: `${GROUNDING} Rewrite the text in plain English a non-lawyer understands, without losing legal accuracy. ${JSON_ONLY} Schema: {"explanation": string}.`,
    user: text,
  };
}

export function riskPrompt(text: string, category: string): Prompt2 {
  return {
    system:
      `${GROUNDING} Assess the risk of the text in the "${category}" context using a 5x5 severity-by-likelihood model. ${JSON_ONLY} ` +
      `Schema: {"summary": string, "riskLevel": "green"|"yellow"|"orange"|"red", "riskScore": number, ` +
      `"severity": string, "severityValue": number, "severityRationale": string, ` +
      `"likelihood": string, "likelihoodValue": number, "likelihoodRationale": string, ` +
      `"riskCategory": string, "riskDescription": string, ` +
      `"mitigationOptions": [{"description": string, "effectiveness": string, "effort": string, "recommended": boolean}]}. ` +
      `severityValue and likelihoodValue are integers 1 to 5.`,
    user: text,
  };
}

export function compliancePrompt(text: string, regulationType: string, documentCategory: string): Prompt2 {
  return {
    system:
      `${GROUNDING} Check the text for compliance with ${regulationType} (document category: ${documentCategory}). ${JSON_ONLY} ` +
      `Schema: {"overallStatus": "compliant"|"partially_compliant"|"non_compliant"|"not_applicable", ` +
      `"complianceScore": number, "summary": string, "regulationType": string, ` +
      `"requirements": [{"requirementName": string, "regulationReference": string, ` +
      `"status": "compliant"|"partially_compliant"|"non_compliant"|"not_applicable", "findings": string, ` +
      `"gapDescription": string|null, "recommendation": string|null, "priority": string}], ` +
      `"gaps": [{"gapName": string, "description": string, "riskLevel": string, "remediation": string}]}.`,
    user: text,
  };
}

export function guidelinesPrompt(documentText: string, guidelines: string[]): Prompt2 {
  return {
    system:
      `${GROUNDING} For each guideline, give a verdict grounded in the document, with a verbatim proving quote copied from the document (empty string when not grounded). ${JSON_ONLY} ` +
      `Schema: {"results": [{"guideline": string, "verdict": "met"|"partial"|"not_met"|"unclear", "explanation": string, "quote": string}]}. ` +
      `Return one result per guideline, in order.`,
    user: `Guidelines:\n${guidelines.map((g, i) => `${i + 1}. ${g}`).join("\n")}\n\nDocument:\n${documentText.slice(0, 200_000)}`,
  };
}

export function citationStylePrompt(citations: string[]): Prompt2 {
  return {
    system:
      `${GROUNDING} Check each US legal citation for Bluebook FORMAT only (not whether the case exists). ${JSON_ONLY} ` +
      `Schema: {"results": [{"citation": string, "compliant": boolean, "issues": string[], "suggested": string}]}. ` +
      `One result per input citation, in order. "suggested" is the corrected form (or the same string if already correct).`,
    user: citations.map((c, i) => `${i + 1}. ${c}`).join("\n"),
  };
}

export function ndaTriagePrompt(
  documentText: string,
  counterpartyName: string,
  businessContext: string,
): Prompt2 {
  return {
    system:
      `${GROUNDING} Screen this NDA against 10 standard criteria and classify it green (safe to sign), yellow (minor issues), or red (needs counsel). ` +
      `Criteria, in this id order: 1 Definition of Confidential Information, 2 Permitted Use, 3 Exclusions / carve-outs, 4 Term and duration, ` +
      `5 Return or destruction of materials, 6 No license granted, 7 Remedies and injunctive relief, 8 Governing law and jurisdiction, ` +
      `9 Mutual vs one-sided balance, 10 Traps (residuals, non-solicit, non-compete, assignment). ${JSON_ONLY} ` +
      `Schema: {"classification": "green"|"yellow"|"red", "summary": string, ` +
      `"ndaType": "mutual"|"unilateral_disclosing"|"unilateral_receiving"|"unknown", "counterpartyName": string|null, ` +
      `"criteria": [{"criterionId": number, "criterionName": string, "status": "pass"|"warn"|"fail"|"not_found", ` +
      `"findings": string, "issues": string[], "recommendation": string|null}], ` +
      `"passCount": number, "warnCount": number, "failCount": number, "keyIssues": string[], ` +
      `"routingRecommendation": string, "estimatedTimeline": string|null, ` +
      `"missingCarveouts": string[], "problematicProvisions": string[]}. Return all 10 criteria in id order.`,
    user:
      (counterpartyName ? `Counterparty: ${counterpartyName}\n` : "") +
      (businessContext ? `Business context: ${businessContext}\n` : "") +
      `\nNDA:\n${documentText.slice(0, 200_000)}`,
  };
}

export function reconcilePrompt(clauseText: string, destinationText: string): Prompt2 {
  return {
    system:
      `${GROUNDING} Adapt the borrowed clause's defined terms and cross-references to fit the destination document. ` +
      `Only change terms/references, not substance. ${JSON_ONLY} ` +
      `Schema: {"reconciledText": string, "changes": [{"from": string, "to": string, "note": string}]}.`,
    user: `Borrowed clause:\n${clauseText}\n\nDestination document:\n${destinationText.slice(0, 150_000)}`,
  };
}

export function redactPrompt(documentText: string): Prompt2 {
  return {
    system:
      `${GROUNDING} Detect person, organization, and location entities in the text for redaction. ` +
      `Each "text" MUST be an exact verbatim substring of the document so it can be found and removed. ${JSON_ONLY} ` +
      `Schema: {"entities": [{"category": "person"|"organization"|"location", "text": string}]}.`,
    user: documentText.slice(0, 200_000),
  };
}

export function extractClausePrompt(clause: string, sourceText: string): Prompt2 {
  return {
    system:
      `${GROUNDING} Find the requested clause in the source contract. "text" MUST be copied VERBATIM from the source ` +
      `(an exact substring); if the clause is not present, set found=false and text="". ${JSON_ONLY} ` +
      `Schema: {"found": boolean, "label": string, "text": string}.`,
    user: `Clause to find: ${clause}\n\nSource contract:\n${sourceText.slice(0, 200_000)}`,
  };
}

export function fillPrompt(placeholders: string[], referenceText: string): Prompt2 {
  return {
    system:
      `${GROUNDING} For each placeholder, find its value in the reference document. Every value MUST be backed by a ` +
      `verbatim quote copied from the reference; if you cannot ground a value, set found=false, value="" and quote="". ` +
      `Never invent values. ${JSON_ONLY} ` +
      `Schema: {"fills": [{"placeholder": string, "found": boolean, "value": string, "quote": string}]}. ` +
      `Return one entry per placeholder, in order.`,
    user: `Placeholders:\n${placeholders.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nReference:\n${referenceText.slice(0, 200_000)}`,
  };
}

export function improvePrompt(prompt: string, kind: "drafting" | "legalTool" | "chat"): Prompt2 {
  const what =
    kind === "drafting"
      ? "a document-generation brief"
      : kind === "chat"
        ? "a research question for a legal assistant"
        : "a steering note for a legal analysis";
  return {
    system:
      `${GROUNDING} Sharpen the following ${what}. Do NOT invent facts: unknown parties, amounts, or dates stay as bracketed placeholders. ${JSON_ONLY} ` +
      `Schema: {"original": string, "improved": string, "notes": string|null, "changed": boolean}. ` +
      `Set changed=false and improved=original when it is already clear.`,
    user: prompt,
  };
}

export function classifyContractPrompt(documentText: string): Prompt2 {
  return {
    system:
      `${GROUNDING} Identify the contract type from the text. Return a lowercase snake_case key (e.g. "nda", "msa", "saas", "employment", "dpa", "consulting", "license") or null if unclear. ${JSON_ONLY} ` +
      `Schema: {"contractType": string|null, "confidence": number}. confidence is 0 to 1.`,
    user: documentText.slice(0, 40_000),
  };
}

export function contractReviewPrompt(
  documentText: string,
  contractType: string,
  userSide: string,
  markupLevel: string,
  paperSide: string | undefined,
  instructions: string | undefined,
): Prompt2 {
  const markup =
    markupLevel === "light"
      ? "Flag only escalation-worthy issues."
      : markupLevel === "firm"
        ? "Hard-line every deviation from the preferred position."
        : "Mark gaps to the preferred position.";
  const paper = paperSide === "own" ? "This is our own template; defend it." : paperSide === "counterparty" ? "This is the counterparty's paper; mark it up assertively." : "";
  return {
    system:
      `${GROUNDING} Review this ${contractType || "contract"} from the ${userSide || "reviewing"} side. ${markup} ${paper} ` +
      `For each issue produce a redline. currentLanguage MUST be copied VERBATIM from the contract (an exact substring) so it can be located; ` +
      `if you are proposing to ADD a missing clause, set currentLanguage to "" and grounding to "insertion". ` +
      `Set grounding to "verified" only when currentLanguage is an exact substring of the contract, else "unverified". ` +
      `Mark isDealBreaker true only for walk-away issues. ${JSON_ONLY} ` +
      `Schema: {"summary": string, "overallRisk": "green"|"yellow"|"red", ` +
      `"redlines": [{"clauseName": string, "sectionReference": string|null, "currentLanguage": string, "proposedLanguage": string, ` +
      `"rationale": string, "fallbackPosition": string|null, "grounding": "verified"|"unverified"|"insertion", ` +
      `"isDealBreaker": boolean, "nature": "substantive"|"housekeeping"}], ` +
      `"missingClauses": string[], ` +
      `"negotiationPriorities": [{"tier": number, "tierLabel": string, "items": string[]}], ` +
      `"flags": [{"clauseName": string, "sectionReference": string, "observation": string}]}.`,
    user: (instructions ? `Reviewer instructions: ${instructions}\n\n` : "") + `Contract:\n${documentText.slice(0, 200_000)}`,
  };
}

export function clauseFixPrompt(clauseName: string, currentLanguage: string, jurisdiction: string): Prompt2 {
  return {
    system:
      `${GROUNDING} Draft a stronger, balanced replacement for the "${clauseName}" clause for ${jurisdiction}. ` +
      `Keep it enforceable and surgical. If the current clause is already strong, set noChangeNeeded true and echo it. ${JSON_ONLY} ` +
      `Schema: {"proposedLanguage": string, "rationale": string, "fallbackPosition": string|null, "noChangeNeeded": boolean}.`,
    user: `Current clause:\n${currentLanguage}`,
  };
}

export function playbookFitPrompt(
  documentText: string,
  positions: Record<string, { standardPosition: string; fallbackLadder: string[]; dealBreaker: string | null }>,
): Prompt2 {
  const ladder = Object.entries(positions)
    .map(([clauseType, p]) => {
      const rungs = [p.standardPosition, ...(p.fallbackLadder ?? [])].filter(Boolean);
      const floor = p.dealBreaker ? ` Walk-away: ${p.dealBreaker}.` : "";
      return `- ${clauseType}: ${rungs.join(" | ")}.${floor}`;
    })
    .join("\n");
  return {
    system:
      `${GROUNDING} For each playbook clause, decide where the contract sits on its ladder and give a verdict with a verbatim proving quote from the contract (empty when not grounded). ${JSON_ONLY} ` +
      `Schema: {"results": [{"clauseType": string, "verdict": "meets_standard"|"meets_fallback"|"below_floor"|"not_addressed", "rung": string, "finding": string, "quote": string}]}. ` +
      `One result per playbook clause.`,
    user: `Playbook clauses (best-first ladder):\n${ladder}\n\nContract:\n${documentText.slice(0, 180_000)}`,
  };
}

export function playbookExtractPrompt(text: string): Prompt2 {
  return {
    system:
      `${GROUNDING} Extract a starter negotiation playbook from this contract: for each key clause, capture the standard position it takes. ${JSON_ONLY} ` +
      `Schema: {"contractType": string, "positions": {"<clause_type_key>": {"standardPosition": string, "fallbackLadder": string[], "dealBreaker": string|null}}}. ` +
      `Use lowercase snake_case clause_type keys. Leave fallbackLadder empty and dealBreaker null unless clearly implied.`,
    user: text.slice(0, 180_000),
  };
}

export function draftGeneratePrompt(
  category: string,
  title: string,
  tone: string,
  governingLawState: string,
  specialInstructions: string,
  referenceText: string,
): Prompt2 {
  const gov = governingLawState ? ` governed by ${governingLawState} law` : "";
  return {
    system:
      `${GROUNDING} Draft a complete, professional US ${category} titled "${title}" in a ${tone} tone${gov}. ` +
      `Use clear section headings. Do NOT invent party names, amounts, or dates: leave unknowns as [bracketed placeholders]. ${JSON_ONLY} ` +
      `Schema: {"sections": [{"title": string, "content": string}]}. Produce the full set of sections a ${category} needs, in order.`,
    user:
      (specialInstructions ? `Instructions: ${specialInstructions}\n\n` : "") +
      (referenceText
        ? `Ground party names, defined terms, and specifics in this reference document where relevant:\n${referenceText.slice(0, 300_000)}`
        : "Draft from standard, widely-used terms."),
  };
}
