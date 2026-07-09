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
export const JURISDICTIONS: Option[] = [
  { value: "US", label: "United States (general)" },
  { value: "Delaware", label: "Delaware" },
  { value: "California", label: "California" },
  { value: "New York", label: "New York" },
  { value: "Texas", label: "Texas" },
  { value: "Florida", label: "Florida" },
  { value: "Illinois", label: "Illinois" },
  { value: "Massachusetts", label: "Massachusetts" },
  { value: "Washington", label: "Washington" },
];

export type ReviewScope = "document" | "selection";

/** Map an enum value back to its human label for display. */
export function labelOf(options: Option[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
