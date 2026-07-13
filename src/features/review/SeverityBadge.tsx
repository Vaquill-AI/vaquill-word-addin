import { Badge } from "@/ui/primitives";
import { AlertTriangleIcon } from "@/ui/icons";
import { SEVERITY_META, type Severity } from "@/lib/severity";

export function SeverityBadge({ severity }: { severity: Severity }) {
  const m = SEVERITY_META[severity];
  return (
    <Badge tone={m.tone}>
      {severity === "high" && <AlertTriangleIcon size={11} />}
      {m.label}
    </Badge>
  );
}
