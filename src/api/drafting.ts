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

/** A labelled group of document types, rendered as an <optgroup>. */
export interface OptionGroup {
  label: string;
  options: Option[];
}

/**
 * Document types the generator supports, grouped for the picker. Values are the
 * exact backend `DraftCategory` enum values. India-only litigation categories
 * are intentionally omitted (US-only surface).
 */
export const DRAFT_CATEGORY_GROUPS: OptionGroup[] = [
  {
    label: "Commercial",
    options: [
      { value: "nda", label: "NDA" },
      { value: "service", label: "Services Agreement" },
      { value: "consulting", label: "Consulting Agreement" },
      { value: "vendor_agreement", label: "Vendor Agreement" },
      { value: "dpa", label: "Data Processing Agreement" },
      { value: "baa", label: "Business Associate Agreement" },
      { value: "statement_of_work", label: "Statement of Work" },
      { value: "order_form", label: "Order Form" },
      { value: "supply", label: "Supply Agreement" },
      { value: "sale", label: "Sale Agreement" },
      { value: "reseller_agreement", label: "Reseller Agreement" },
      { value: "sla", label: "Service Level Agreement" },
      { value: "franchise", label: "Franchise Agreement" },
      { value: "film_production", label: "Film Production Agreement" },
    ],
  },
  {
    label: "Corporate",
    options: [
      { value: "partnership", label: "Partnership Agreement" },
      { value: "joint_venture", label: "Joint Venture" },
      { value: "shareholders", label: "Shareholders Agreement" },
      { value: "llc_operating_agreement", label: "LLC Operating Agreement" },
      { value: "safe", label: "SAFE" },
      { value: "convertible_note", label: "Convertible Note" },
      { value: "term_sheet", label: "Term Sheet" },
      { value: "letter_of_intent", label: "Letter of Intent" },
      { value: "stock_purchase_agreement", label: "Stock Purchase Agreement" },
      { value: "board_consent", label: "Board Consent" },
      { value: "loan", label: "Loan Agreement" },
      { value: "promissory_note", label: "Promissory Note" },
      { value: "power_of_attorney", label: "Power of Attorney" },
      { value: "settlement_agreement", label: "Settlement Agreement" },
    ],
  },
  {
    label: "Employment",
    options: [
      { value: "employment", label: "Employment Agreement" },
      { value: "offer_letter", label: "Offer Letter" },
      { value: "independent_contractor", label: "Independent Contractor" },
      { value: "severance_agreement", label: "Severance Agreement" },
    ],
  },
  {
    label: "Litigation",
    options: [
      { value: "complaint_civil", label: "Civil Complaint" },
      { value: "answer", label: "Answer" },
      { value: "motion", label: "Motion" },
      { value: "motion_to_dismiss", label: "Motion to Dismiss" },
      { value: "summary_judgment", label: "Summary Judgment" },
      { value: "discovery_request", label: "Discovery Request" },
      { value: "subpoena", label: "Subpoena" },
      { value: "interrogatories", label: "Interrogatories" },
      { value: "deposition_notice", label: "Deposition Notice" },
      { value: "cease_desist", label: "Cease and Desist" },
      { value: "demand_letter", label: "Demand Letter" },
      { value: "appeal_brief", label: "Appeal Brief" },
    ],
  },
  {
    label: "Real Estate",
    options: [
      { value: "lease", label: "Lease" },
      { value: "month_to_month_rental", label: "Month-to-Month Rental" },
      { value: "sublease_agreement", label: "Sublease Agreement" },
      { value: "lease_amendment", label: "Lease Amendment" },
      { value: "lease_renewal", label: "Lease Renewal" },
      { value: "notice_of_non_renewal", label: "Notice of Non-Renewal" },
      { value: "rent_increase_notice", label: "Rent Increase Notice" },
      { value: "notice_of_entry", label: "Notice of Entry" },
      { value: "notice_to_pay_or_quit", label: "Notice to Pay or Quit" },
      { value: "notice_to_cure_or_quit", label: "Notice to Cure or Quit" },
      { value: "notice_to_quit_unconditional", label: "Notice to Quit (Unconditional)" },
      { value: "notice_of_termination", label: "Notice of Termination" },
      { value: "notice_of_termination_by_tenant", label: "Notice of Termination (Tenant)" },
      { value: "security_deposit_itemization", label: "Security Deposit Itemization" },
      { value: "security_deposit_return_demand", label: "Security Deposit Return Demand" },
      { value: "estoppel_certificate", label: "Estoppel Certificate" },
      { value: "cosigner_guarantor_agreement", label: "Cosigner / Guarantor Agreement" },
      { value: "repair_and_deduct_notice", label: "Repair and Deduct Notice" },
      { value: "habitability_complaint", label: "Habitability Complaint" },
      { value: "answer_to_eviction", label: "Answer to Eviction" },
      { value: "affirmative_defense_brief", label: "Affirmative Defense Brief" },
      { value: "lockout_damages_demand", label: "Lockout Damages Demand" },
      { value: "tenant_petition_for_repairs", label: "Tenant Petition for Repairs" },
      { value: "anti_retaliation_complaint", label: "Anti-Retaliation Complaint" },
      { value: "wrongful_eviction_complaint", label: "Wrongful Eviction Complaint" },
      { value: "motion_to_quash_ud_service", label: "Motion to Quash UD Service" },
      { value: "demurrer_to_ud_complaint", label: "Demurrer to UD Complaint" },
      { value: "discovery_request_ud_defense", label: "Discovery Request (UD Defense)" },
      { value: "motion_to_stay_execution", label: "Motion to Stay Execution" },
      { value: "motion_for_relief_from_default", label: "Motion for Relief from Default" },
      { value: "motion_to_expunge_eviction_record", label: "Motion to Expunge Eviction Record" },
      { value: "fha_reasonable_accommodation_request", label: "FHA Reasonable Accommodation Request" },
      { value: "vawa_emergency_transfer_request", label: "VAWA Emergency Transfer Request" },
      { value: "fcra_adverse_action_dispute", label: "FCRA Adverse Action Dispute" },
      { value: "ab1482_exemption_addendum", label: "AB 1482 Exemption Addendum" },
      { value: "stipulation_for_judgment", label: "Stipulation for Judgment" },
      { value: "cash_for_keys_agreement", label: "Cash-for-Keys Agreement" },
      { value: "settlement_and_release", label: "Settlement and Release" },
      { value: "relocation_assistance_notice", label: "Relocation Assistance Notice" },
      { value: "small_claims_complaint", label: "Small Claims Complaint" },
    ],
  },
  {
    label: "IP / Other",
    options: [
      { value: "ip_assignment", label: "IP Assignment" },
      { value: "software_license", label: "Software License" },
      { value: "trademark_license", label: "Trademark License" },
      { value: "open_source_license", label: "Open Source License" },
      { value: "custom", label: "Custom" },
    ],
  },
];

/**
 * Flat listing of every document type, used by `labelOf` and default lookups.
 * Derived from the grouped set so the two never drift.
 */
export const DRAFT_CATEGORIES: Option[] = DRAFT_CATEGORY_GROUPS.flatMap((g) => g.options);

/** Drafting tone (ClauseTone in the backend). Sent as the `tone` field. */
export const DRAFT_TONES: Option[] = [
  { value: "protective", label: "Protective" },
  { value: "balanced", label: "Balanced" },
  { value: "permissive", label: "Permissive" },
];

export interface GeneratedSection {
  id: string;
  title: string;
  content: string;
  clauseType?: string | null;
}

/**
 * A structured issue for the review queue (DraftIssue in the backend). Older
 * responses omit `issues` entirely, so treat every field as optional.
 */
export interface DraftIssue {
  sectionId?: string | null;
  sectionTitle?: string | null;
  severity?: "info" | "warning" | "error";
  code: string;
  message: string;
  suggestedFix?: string | null;
}

/**
 * One legal authority cited across the draft (DraftAuthority in the backend).
 * `url` is present only when a click-to-verify link could be built.
 */
export interface DraftAuthority {
  citation: string;
  url?: string | null;
  kind?: string;
  jurisdiction?: string;
  verified?: boolean;
  pinpoint?: string;
}

export interface DraftResult {
  draftId: string;
  title: string;
  category: string;
  fullText: string;
  sections: GeneratedSection[];
  qualityScore?: number;
  issues?: DraftIssue[];
  authorities?: DraftAuthority[];
}

export interface DraftParams {
  category: string;
  title: string;
  governingLawState?: string;
  specialInstructions?: string;
  tone?: string;
}

const GENERATE = "/api/v1/drafting/generate";

export async function generateDraft(p: DraftParams): Promise<DraftResult> {
  return request(GENERATE, {
    method: "POST",
    body: {
      category: p.category,
      title: p.title,
      jurisdiction: "US",
      tone: p.tone || "balanced",
      special_instructions: p.specialInstructions || undefined,
      governing_law_state: p.governingLawState || undefined,
    },
  });
}
