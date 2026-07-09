import { request } from "./http";

/**
 * Selection-scoped clause tools.
 * Endpoints: POST /api/v1/drafting/clause/rewrite and /clause/explain.
 * Note: these request bodies use snake_case keys (the backend models set
 * serialization_alias only, so camelCase is output-only; input is by field name).
 * Responses come back camelCase.
 */

export interface RewriteResult {
  original: string;
  rewritten: string;
  changesSummary: string;
}

export interface ExplainResult {
  explanation: string;
  keyObligations: string[];
  risks: string[];
  applicableActs: string[];
}

const REWRITE = "/api/v1/drafting/clause/rewrite";
const EXPLAIN = "/api/v1/drafting/clause/explain";

export async function rewriteClause(
  clauseText: string,
  instruction: string,
  jurisdiction = "US",
): Promise<RewriteResult> {
  return request(REWRITE, {
    method: "POST",
    body: { clause_text: clauseText, instruction, jurisdiction },
  });
}

export async function explainClause(clauseText: string, jurisdiction = "US"): Promise<ExplainResult> {
  return request(EXPLAIN, {
    method: "POST",
    body: { clause_text: clauseText, jurisdiction },
  });
}
