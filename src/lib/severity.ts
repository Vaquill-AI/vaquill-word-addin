export type Severity = "high" | "medium" | "low";

export function severityOf(r: {
  isDealBreaker: boolean;
  approvalLevel?: "none" | "manager" | "partner" | "gc" | null;
}): Severity {
  if (r.isDealBreaker || r.approvalLevel === "partner" || r.approvalLevel === "gc") {
    return "high";
  }
  if (r.approvalLevel === "manager") {
    return "medium";
  }
  return "low";
}

export const SEVERITY_META: Record<Severity, { label: string; tone: "red" | "yellow" | "neutral" }> = {
  high: { label: "High", tone: "red" },
  medium: { label: "Medium", tone: "yellow" },
  low: { label: "Low", tone: "neutral" },
};
