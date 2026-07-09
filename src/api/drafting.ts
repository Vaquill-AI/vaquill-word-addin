import { request } from "./http";

/**
 * Draft generation. POST /api/v1/drafting/generate produces a full,
 * template-constrained first-draft agreement (3 quota units, multi-LLM, not
 * streamed). The response includes `fullText` (plain text) which the add-in
 * inserts straight into Word. Request body is snake_case (the backend model
 * uses serialization_alias only; input is by field name).
 */

export interface Option {
  value: string;
  label: string;
}

/** Document types the generator supports (DraftCategory in the backend). */
export const DRAFT_CATEGORIES: Option[] = [
  { value: "nda", label: "NDA" },
  { value: "service", label: "Services Agreement" },
  { value: "consulting", label: "Consulting Agreement" },
  { value: "vendor_agreement", label: "Vendor Agreement" },
  { value: "dpa", label: "Data Processing Agreement" },
  { value: "baa", label: "Business Associate Agreement" },
  { value: "statement_of_work", label: "Statement of Work" },
  { value: "order_form", label: "Order Form" },
  { value: "employment", label: "Employment Agreement" },
  { value: "offer_letter", label: "Offer Letter" },
  { value: "independent_contractor", label: "Independent Contractor" },
  { value: "ip_assignment", label: "IP Assignment" },
  { value: "supply", label: "Supply Agreement" },
  { value: "sale", label: "Sale Agreement" },
  { value: "lease", label: "Lease" },
  { value: "loan", label: "Loan Agreement" },
  { value: "partnership", label: "Partnership Agreement" },
  { value: "joint_venture", label: "Joint Venture" },
  { value: "shareholders", label: "Shareholders Agreement" },
  { value: "franchise", label: "Franchise Agreement" },
  { value: "power_of_attorney", label: "Power of Attorney" },
];

export interface GeneratedSection {
  id: string;
  title: string;
  content: string;
  clauseType?: string | null;
}

export interface DraftResult {
  draftId: string;
  title: string;
  category: string;
  fullText: string;
  sections: GeneratedSection[];
  qualityScore?: number;
}

export interface DraftParams {
  category: string;
  title: string;
  governingLawState?: string;
  specialInstructions?: string;
}

const GENERATE = "/api/v1/drafting/generate";

export async function generateDraft(p: DraftParams): Promise<DraftResult> {
  return request(GENERATE, {
    method: "POST",
    body: {
      category: p.category,
      title: p.title,
      jurisdiction: "US",
      special_instructions: p.specialInstructions || undefined,
      governing_law_state: p.governingLawState || undefined,
    },
  });
}
