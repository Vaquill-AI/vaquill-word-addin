import type { ReactNode } from "react";
import { Badge } from "@/ui/primitives";
import { InlineDiff } from "@/features/review/InlineDiff";
import { GroundingBadge } from "@/features/review/GroundingBadge";

/**
 * Empty state for the assistant's Edit mode. Instead of a blank pane, we show
 * what Edit produces: a few tappable example instructions (which prefill the
 * composer so the user just tweaks and sends) and a labeled, non-interactive
 * preview of the exact redline shape they will get -- before/after diff, why,
 * and the fallback position. The preview reuses the real review components
 * (InlineDiff, GroundingBadge) so it matches the live output faithfully.
 */

function svg(children: ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const SCALE = svg(<path d="M12 3v18M5 21h14M6 7l-3 6a3 3 0 0 0 6 0L6 7zm12 0l-3 6a3 3 0 0 0 6 0l-3-6zM7 7h10" />);
const SHIELD = svg(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />);
const CLOCK = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
const PLUS = svg(<path d="M12 5v14M5 12h14" />);

interface Starter {
  title: string;
  instruction: string;
  icon: ReactNode;
}

interface PreviewExample {
  clauseName: string;
  before: string;
  after: string;
  why: string;
  fallback: string;
  approval?: "Manager" | "Partner";
  dealBreaker?: boolean;
}

const GENERIC_STARTERS: Starter[] = [
  {
    title: "Make it more favorable to me",
    instruction:
      "Make this contract more favorable to my side: cap liability, soften one-sided terms, and add a termination-for-convenience right.",
    icon: SHIELD,
  },
  {
    title: "Add missing protections",
    instruction:
      "Add any standard protections this contract is missing, such as indemnification, a limitation of liability, and confidentiality.",
    icon: PLUS,
  },
  {
    title: "Soften one-sided terms",
    instruction:
      "Find terms that favor the counterparty and soften them toward a mutual, market position.",
    icon: SCALE,
  },
];

const STARTERS_BY_TYPE: Record<string, Starter[]> = {
  nda: [
    {
      title: "Cap the confidentiality term",
      instruction:
        "Cap the confidentiality term at three (3) years and add the standard carve-outs: publicly available, independently developed, already known, and required by law.",
      icon: CLOCK,
    },
    {
      title: "Make obligations mutual",
      instruction: "Make the confidentiality obligations mutual rather than one-sided.",
      icon: SHIELD,
    },
    {
      title: "Add a return-or-destroy clause",
      instruction:
        "Add a clause requiring return or destruction of confidential information on termination or request.",
      icon: PLUS,
    },
  ],
  msa: [
    {
      title: "Add a liability cap",
      instruction:
        "Add a mutual limitation of liability capped at the fees paid in the prior twelve (12) months, with standard carve-outs for confidentiality and indemnification.",
      icon: SHIELD,
    },
    {
      title: "Add termination for convenience",
      instruction: "Add a termination-for-convenience right with thirty (30) days' written notice.",
      icon: PLUS,
    },
    {
      title: "Loosen payment terms to net-30",
      instruction:
        "Change the payment terms to net-30 on undisputed invoices and add a dispute carve-out.",
      icon: CLOCK,
    },
  ],
  employment: [
    {
      title: "Narrow the non-compete",
      instruction:
        "Narrow the non-compete to twelve (12) months and the states where the company does business, or convert it to a non-solicit.",
      icon: SHIELD,
    },
    {
      title: "Clarify at-will status",
      instruction: "Make the at-will employment status explicit and consistent throughout the agreement.",
      icon: SCALE,
    },
    {
      title: "Add severance without cause",
      instruction:
        "Add a severance provision of a reasonable number of weeks on termination without cause.",
      icon: PLUS,
    },
  ],
  lease: [
    {
      title: "Add a notice-and-cure period",
      instruction: "Add a written notice and reasonable cure period before any default or termination.",
      icon: CLOCK,
    },
    {
      title: "Cap rent escalation",
      instruction: "Cap the annual rent escalation at a fixed percentage.",
      icon: SCALE,
    },
    {
      title: "Clarify repair responsibilities",
      instruction:
        "Clarify which repairs are the landlord's responsibility versus the tenant's.",
      icon: SHIELD,
    },
  ],
};

const GENERIC_PREVIEW: PreviewExample = {
  clauseName: "Limitation of Liability",
  before: "In no event shall the Provider's total liability exceed one hundred dollars ($100).",
  after:
    "Neither party shall be liable for indirect or consequential damages, and each party's total liability is capped at the fees paid in the twelve (12) months preceding the claim.",
  why: "A token cap leaves you exposed. This sets a mutual, market cap tied to fees paid.",
  fallback: "If rejected, cap at two times (2x) the fees paid in the prior 12 months.",
  approval: "Manager",
};

const PREVIEW_BY_TYPE: Record<string, PreviewExample> = {
  nda: {
    clauseName: "Term of Confidentiality",
    before: "The obligations of confidentiality shall survive in perpetuity.",
    after:
      "The obligations of confidentiality shall survive for three (3) years following termination of this Agreement.",
    why: "Perpetual confidentiality is hard to administer. Two to five years is market standard.",
    fallback: "If rejected, five (5) years following termination.",
    approval: "Manager",
  },
  msa: {
    clauseName: "Payment Terms",
    before: "Customer shall pay all invoices within fifteen (15) days.",
    after: "Customer shall pay all undisputed invoices within thirty (30) days of receipt.",
    why: "Net-15 is aggressive. Net-30 on undisputed amounts is standard and adds a dispute carve-out.",
    fallback: "If rejected, net-20 with the undisputed-amounts carve-out.",
    approval: "Manager",
  },
  employment: {
    clauseName: "Non-Compete",
    before: "Employee shall not compete with the Company for five (5) years anywhere in the world.",
    after:
      "Employee shall not compete with the Company for twelve (12) months within the states where the Company actively does business.",
    why: "A five-year worldwide non-compete is likely unenforceable. This narrows term and geography to a defensible scope.",
    fallback: "If rejected, convert to a twelve (12) month non-solicit.",
    dealBreaker: true,
    approval: "Partner",
  },
  lease: {
    clauseName: "Default and Cure",
    before: "Any breach by Tenant permits immediate termination.",
    after:
      "Landlord shall provide written notice and a ten (10) day cure period before terminating for any non-monetary default.",
    why: "Immediate termination with no cure is punitive. A notice-and-cure period is standard tenant protection.",
    fallback: "If rejected, a five (5) day cure period for monetary defaults.",
    approval: "Manager",
  },
};

export function EditIntro({
  contractType,
  onPick,
}: {
  contractType?: string | null;
  onPick: (instruction: string) => void;
}) {
  const starters = (contractType && STARTERS_BY_TYPE[contractType]) || GENERIC_STARTERS;
  const preview = (contractType && PREVIEW_BY_TYPE[contractType]) || GENERIC_PREVIEW;

  return (
    <div className="edit-intro">
      <div className="assistant__greeting">
        <p className="assistant__greeting-title">Describe a change to the document.</p>
        <p className="assistant__greeting-sub">
          You get grounded redlines to accept or reject, one clause at a time.
        </p>
      </div>

      <div className="suggest-chips">
        {starters.map((s) => (
          <button
            key={s.title}
            type="button"
            className="suggest-chip"
            onClick={() => onPick(s.instruction)}
            title={s.instruction}
          >
            <span className="suggest-chip__icon" aria-hidden>
              {s.icon}
            </span>
            {s.title}
          </button>
        ))}
      </div>

      <div className="edit-preview" aria-hidden>
        <span className="edit-preview__tag">Example of what you get</span>
        <div className="edit-preview__head">
          <strong className="edit-preview__name">{preview.clauseName}</strong>
          <div className="edit-preview__badges">
            {preview.dealBreaker && <Badge tone="red">Deal-breaker</Badge>}
            {preview.approval && <Badge tone="yellow">{preview.approval} sign-off</Badge>}
            <GroundingBadge grounding="verified" />
          </div>
        </div>
        <InlineDiff before={preview.before} after={preview.after} />
        <p className="small muted edit-preview__why">{preview.why}</p>
        <p className="small edit-preview__fallback">
          <strong>Fallback if rejected:</strong> <span className="muted">{preview.fallback}</span>
        </p>
      </div>
    </div>
  );
}
