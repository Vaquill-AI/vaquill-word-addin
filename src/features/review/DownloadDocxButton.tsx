import { Button } from "@/ui/primitives";
import { MicrosoftWordIcon } from "@/ui/icons";
import { isCommunity } from "@/community/edition";
import { HOSTED_URL, LockIcon } from "@/ui/UpgradeGate";

/**
 * Download the corrected .docx (native tracked changes), authored server-side.
 * Carries the Microsoft Word brand mark so the action reads as "save a Word
 * file". The corrected export runs on the hosted service, so in the community/
 * BYOK edition this is a locked link to the hosted plan instead of a live button.
 */
export function DownloadDocxButton({
  onDownload,
  downloading,
  block = true,
  size,
}: {
  onDownload: () => void;
  downloading: boolean;
  block?: boolean;
  size?: "sm";
}) {
  if (isCommunity()) {
    const cls = ["btn", size === "sm" && "btn--sm", block && "btn--block"].filter(Boolean).join(" ");
    return (
      <a
        className={cls}
        href={HOSTED_URL}
        target="_blank"
        rel="noreferrer"
        title="The corrected .docx export runs on the Vaquill AI hosted plan"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none" }}
      >
        <MicrosoftWordIcon size={16} />
        Download .docx
        <LockIcon size={13} />
      </a>
    );
  }
  return (
    <Button
      variant="default"
      size={size}
      block={block}
      onClick={onDownload}
      loading={downloading}
      title="Download a redlined .docx"
    >
      <MicrosoftWordIcon size={16} /> {downloading ? "Preparing..." : "Download .docx"}
    </Button>
  );
}
