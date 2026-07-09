import { Badge } from "@/ui/primitives";
import { SEVERITY_META, type Severity } from "@/lib/severity";

export function SeverityBadge({ severity }: { severity: Severity }) {
  const m = SEVERITY_META[severity];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
