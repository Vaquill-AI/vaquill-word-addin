import { Badge } from "@/ui/primitives";
import type { ComplianceRequirement } from "@/api/clause-tools";
import { statusLabel, statusTone } from "./status";
import { DraftFix } from "./DraftFix";

function priorityBadge(priority?: string) {
  const p = (priority ?? "").toLowerCase();
  if (p === "high" || p === "critical") return <Badge tone="red">High priority</Badge>;
  if (p === "medium") return <Badge tone="yellow">Medium</Badge>;
  return null;
}

/**
 * One requirement in the compliance checklist: its status pill, name, the
 * regulation reference, what the check found, and (when there is a gap) the gap
 * plus the recommended fix. Every field is optional on the wire and null-guarded.
 */
export function RequirementCard({ req }: { req: ComplianceRequirement }) {
  // Only gaps get a "Draft a fix" affordance: a compliant/N/A requirement has
  // nothing to remediate.
  const canDraftFix = req.status === "non_compliant" || req.status === "partially_compliant";
  return (
    <div className="req-card">
      <div className="req-card__head">
        <Badge tone={statusTone(req.status)}>{statusLabel(req.status)}</Badge>
        {priorityBadge(req.priority)}
      </div>

      {req.requirementName && <p className="req-card__name">{req.requirementName}</p>}
      {req.regulationReference && (
        <p className="req-card__ref small muted">{req.regulationReference}</p>
      )}
      {req.findings && <p className="small">{req.findings}</p>}

      {req.gapDescription && (
        <p className="req-card__gap small">
          <span className="req-card__tag req-card__tag--gap">Gap</span> {req.gapDescription}
        </p>
      )}
      {req.recommendation && (
        <p className="req-card__rec small">
          <span className="req-card__tag req-card__tag--fix">Fix</span> {req.recommendation}
        </p>
      )}

      {canDraftFix && <DraftFix req={req} />}
    </div>
  );
}
