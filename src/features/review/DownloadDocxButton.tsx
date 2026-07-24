import { Button } from "@/ui/primitives";
import { MicrosoftWordIcon } from "@/ui/icons";
import { isCommunity } from "@/community/edition";

/**
 * Download a redlined .docx.
 *
 * Hosted: the corrected copy is authored server-side (native tracked changes,
 * stamped "Vaquill AI Contract Review") and left as a separate file, so the open
 * document is untouched.
 *
 * Community/BYOK: there is no backend, so the same result is produced on-device
 * (see ReviewActionBar): the open redlines are applied as tracked changes and
 * the current document is exported via getFileAsync. The one difference is that
 * the tracked changes also land in the open document (reversible), so the label
 * says "Apply all & download" to set that expectation. Carries the Microsoft
 * Word brand mark so the action reads as "save a Word file".
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
  const community = isCommunity();
  return (
    <Button
      variant="default"
      size={size}
      block={block}
      onClick={onDownload}
      loading={downloading}
      title={
        community
          ? "Apply the open redlines as tracked changes in this document, then download the redlined .docx. The changes also stay in your open document (reverse them with Word's Undo, or Reject in the Review tab)."
          : "Download a redlined .docx"
      }
    >
      <MicrosoftWordIcon size={16} />{" "}
      {downloading
        ? "Preparing..."
        : community
          ? "Apply all & download"
          : "Download .docx"}
    </Button>
  );
}
