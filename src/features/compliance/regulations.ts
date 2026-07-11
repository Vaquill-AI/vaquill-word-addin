/**
 * US-relevant regulations the whole-document compliance check supports. Values
 * are the backend `RegulationType` enum values consumed by
 * POST /api/v1/legal-tools/compliance-check. Keep this list a subset of the
 * backend SUPPORTED_REGULATIONS so we never send one the server rejects (400).
 */
export interface RegulationOption {
  value: string;
  label: string;
  /** One-line, lawyer-plain description shown under the picker. */
  blurb: string;
}

export const REGULATIONS: RegulationOption[] = [
  { value: "ccpa", label: "CCPA / CPRA", blurb: "California consumer privacy: notice, opt-out, and data-rights obligations." },
  { value: "hipaa", label: "HIPAA", blurb: "Protected health information: safeguards, BAAs, and breach handling." },
  { value: "glba", label: "GLBA", blurb: "Financial privacy: safeguards rule and consumer financial data handling." },
  { value: "ferpa", label: "FERPA", blurb: "Student education records: access, disclosure, and consent rules." },
  { value: "tcpa", label: "TCPA", blurb: "Telemarketing and SMS: consent, opt-out, and contact restrictions." },
  { value: "sox", label: "SOX", blurb: "Financial reporting and internal-control obligations." },
  { value: "pci_dss", label: "PCI DSS", blurb: "Payment-card data: storage, transmission, and security controls." },
  { value: "soc2", label: "SOC 2", blurb: "Security, availability, and confidentiality trust-service criteria." },
  { value: "gdpr", label: "GDPR", blurb: "EU data protection: lawful basis, data-subject rights, transfers." },
];

export function regulationLabel(value: string): string {
  return REGULATIONS.find((r) => r.value === value)?.label ?? value.toUpperCase();
}
