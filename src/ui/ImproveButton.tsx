import { Button } from "@/ui/primitives";
import { WandIcon } from "@/ui/icons";

/** The shared "Improve with AI" affordance placed next to a free-text field.
 *  Sharpens a rough instruction/brief/question into one the AI can act on. */
export function ImproveButton({
  improving,
  disabled,
  onClick,
  label = "Improve with AI",
}: {
  improving: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      loading={improving}
      disabled={disabled}
    >
      <WandIcon size={13} /> {label}
    </Button>
  );
}
