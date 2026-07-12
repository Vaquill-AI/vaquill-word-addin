/**
 * Curated option lists for the review form.
 * Values must match the backend enums exactly (ContractType, UserSide in
 * app/models/legal_tools_schemas.py) or the request is rejected with a 422.
 */
export interface Option {
  value: string;
  label: string;
}

export const CONTRACT_TYPES: Option[] = [
  { value: "nda", label: "NDA" },
  { value: "msa", label: "Master Services Agreement" },
  { value: "saas", label: "SaaS Agreement" },
  { value: "dpa", label: "Data Processing Agreement" },
  { value: "sow", label: "Statement of Work" },
  { value: "order_form", label: "Order Form" },
  { value: "consulting", label: "Consulting Agreement" },
  { value: "professional_services", label: "Professional Services" },
  { value: "license", label: "License Agreement" },
  { value: "eula", label: "EULA" },
  { value: "terms_of_service", label: "Terms of Service" },
  { value: "vendor_agreement", label: "Vendor Agreement" },
  { value: "reseller_distribution", label: "Reseller / Distribution" },
  { value: "supply", label: "Supply Agreement" },
  { value: "procurement", label: "Procurement" },
  { value: "baa", label: "Business Associate Agreement" },
  { value: "employment", label: "Employment Agreement" },
  { value: "executive_employment", label: "Executive Employment" },
  { value: "independent_contractor", label: "Independent Contractor" },
  { value: "offer_letter", label: "Offer Letter" },
  { value: "severance_agreement", label: "Severance Agreement" },
  { value: "non_compete", label: "Non-Compete" },
  { value: "ip_assignment", label: "IP Assignment" },
  { value: "partnership", label: "Partnership Agreement" },
  { value: "asset_purchase", label: "Asset Purchase" },
  { value: "stock_purchase", label: "Stock Purchase" },
  { value: "merger_agreement", label: "Merger Agreement" },
  { value: "shareholders_agreement", label: "Shareholders Agreement" },
  { value: "operating_agreement", label: "Operating Agreement" },
  { value: "safe", label: "SAFE" },
  { value: "term_sheet", label: "Term Sheet" },
  { value: "settlement_agreement", label: "Settlement Agreement" },
  { value: "engagement_letter", label: "Engagement Letter" },
  { value: "loan", label: "Loan Agreement" },
  { value: "lease", label: "Lease" },
  { value: "sale", label: "Sale Agreement" },
  { value: "other", label: "Other" },
];

export const USER_SIDES: Option[] = [
  { value: "customer", label: "Customer" },
  { value: "vendor", label: "Vendor / Supplier" },
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "licensee", label: "Licensee" },
  { value: "licensor", label: "Licensor" },
  { value: "disclosing_party", label: "Disclosing Party" },
  { value: "receiving_party", label: "Receiving Party" },
  { value: "employer", label: "Employer" },
  { value: "employee", label: "Employee" },
  { value: "company", label: "Company" },
  { value: "investor", label: "Investor" },
  { value: "lender", label: "Lender" },
  { value: "borrower", label: "Borrower" },
  { value: "partner", label: "Partner" },
  { value: "reseller", label: "Reseller" },
  { value: "other", label: "Other" },
];

/** US-first jurisdictions. The backend accepts a free string; these are common. */
// Governing-law options. `value` is the US STATE CODE sent as
// dealContext.governingLaw (backend expects 'CA'/'NY'/'DE'); the empty value
// means "no specific state" (general US / federal). The top-level review
// `jurisdiction` is always "US" -- state names must NOT go into that field
// (backend pattern ^([A-Z]{2}|INTL)$ 422s on "Delaware").
/**
 * Supported US jurisdictions. Single source of truth is the backend
 * `app/core/us_states.py::US_STATES` (which mirrors the web app's
 * `frontend/src/lib/us-states.ts`): the curated set of states where we ship real
 * depth (statutes corpus, templates, exemplars). Codes are lowercase to match
 * the backend `state` payload; "" is general US / federal. Keep this in sync
 * when the supported set changes.
 */
export const JURISDICTIONS: Option[] = [
  { value: "", label: "United States (general)" },
  { value: "al", label: "Alabama" },
  { value: "az", label: "Arizona" },
  { value: "ca", label: "California" },
  { value: "co", label: "Colorado" },
  { value: "ct", label: "Connecticut" },
  { value: "dc", label: "District of Columbia" },
  { value: "fl", label: "Florida" },
  { value: "ga", label: "Georgia" },
  { value: "il", label: "Illinois" },
  { value: "in", label: "Indiana" },
  { value: "la", label: "Louisiana" },
  { value: "md", label: "Maryland" },
  { value: "ma", label: "Massachusetts" },
  { value: "mi", label: "Michigan" },
  { value: "mn", label: "Minnesota" },
  { value: "mo", label: "Missouri" },
  { value: "nv", label: "Nevada" },
  { value: "nj", label: "New Jersey" },
  { value: "ny", label: "New York" },
  { value: "nc", label: "North Carolina" },
  { value: "oh", label: "Ohio" },
  { value: "or", label: "Oregon" },
  { value: "pa", label: "Pennsylvania" },
  { value: "sc", label: "South Carolina" },
  { value: "tn", label: "Tennessee" },
  { value: "tx", label: "Texas" },
  { value: "va", label: "Virginia" },
  { value: "wa", label: "Washington" },
  { value: "wi", label: "Wisconsin" },
];

export type ReviewScope = "document" | "selection";

/** How aggressively to mark up (backend markup_level). */
export const MARKUP_LEVELS: Option[] = [
  { value: "standard", label: "Standard (mark gaps to preferred)" },
  { value: "light", label: "Light (only escalation triggers)" },
  { value: "firm", label: "Firm (hard-line every deviation)" },
];

/** Whose paper this is (backend paper_side). "" omits it. */
export const PAPER_SIDES: Option[] = [
  { value: "", label: "Unknown / not sure" },
  { value: "counterparty", label: "Their paper (mark up assertively)" },
  { value: "own", label: "Our template (defend our positions)" },
];

/** Map an enum value back to its human label for display. */
export function labelOf(options: Option[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
