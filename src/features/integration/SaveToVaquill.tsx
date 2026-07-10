import { useState } from "react";
import { Button, Banner } from "@/ui/primitives";
import { MatterPicker } from "./MatterPicker";
import { importDraft, uploadTemplate, extractVendorFromDraft, type ImportRedline } from "@/api/platform";
import { readDocumentText } from "@/office/document";
import { readDocumentBase64 } from "@/office/file";
import { textToTiptap } from "@/lib/tiptap";
import { config } from "@/config";
import type { RedlineSuggestion } from "@/api/types";
import type { DraftResult } from "@/api/drafting";

type Props = (
  | { mode: "review"; redlines: RedlineSuggestion[]; title: string; contractType?: string }
  | { mode: "draft"; draft: DraftResult }
) & { defaultMatterId?: string };

function looksLikeDpa(contractType?: string): boolean {
  return /dpa|baa|data.?process/i.test(contractType ?? "");
}

function mapRedlines(redlines: RedlineSuggestion[]): ImportRedline[] {
  return redlines.map((r, i) => ({
    id: `r${i + 1}`,
    clause_name: r.clauseName,
    section_reference: r.sectionReference ?? undefined,
    current_language: r.grounding === "insertion" ? undefined : r.currentLanguage,
    proposed_language: r.proposedLanguage,
    rationale: r.rationale,
    fallback_position: r.fallbackPosition ?? undefined,
    priority: r.isDealBreaker ? "high" : undefined,
  }));
}

/**
 * Save the reviewed contract or generated draft back into Vaquill: as an
 * editable draft (with redlines rendered as tracked changes + comment threads),
 * or as a reusable template. Optionally scoped to a matter.
 */
export function SaveToVaquill(props: Props) {
  const [matterId, setMatterId] = useState(props.defaultMatterId ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ label: string; url?: string } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  async function saveDraft() {
    setBusy("draft");
    setError(null);
    setSaved(null);
    try {
      let payload;
      if (props.mode === "draft") {
        const content = textToTiptap(props.draft.fullText, {
          title: props.draft.title,
          sectionTitles: props.draft.sections.map((s) => s.title),
        });
        payload = { title: props.draft.title, category: "custom", content, matter_id: matterId || undefined };
      } else {
        const text = await readDocumentText();
        const content = textToTiptap(text, { title: props.title });
        payload = {
          title: props.title,
          category: "custom",
          content,
          matter_id: matterId || undefined,
          redlines: mapRedlines(props.redlines),
        };
      }
      const ref = await importDraft(payload);
      setDraftId(ref.id ?? null);
      setSaved({
        label:
          props.mode === "review"
            ? "Saved to Vaquill AI with redlines."
            : "Saved to Vaquill AI drafting.",
        url: ref.id ? `${config.appBase}/drafting/${ref.id}` : undefined,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveTemplate() {
    setBusy("template");
    setError(null);
    setSaved(null);
    try {
      const { base64, filename } = await readDocumentBase64();
      const title = props.mode === "draft" ? props.draft.title : props.title;
      await uploadTemplate(base64, filename, title);
      setSaved({ label: "Saved the open document as a template." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addToVendors() {
    if (!draftId) return;
    setBusy("vendor");
    setError(null);
    try {
      await extractVendorFromDraft(draftId);
      setSaved({ label: "Added to the vendor / sub-processor registry." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const showVendor = props.mode === "review" && looksLikeDpa(props.contractType) && !!draftId;
  const draftLabel =
    props.mode === "review" ? "Open in Vaquill AI (with redlines)" : "Save to Vaquill AI drafting";

  return (
    <div className="card doc-tools">
      <h2 className="small muted" style={{ margin: 0 }}>Save to Vaquill AI</h2>
      <MatterPicker value={matterId} onChange={setMatterId} />
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Button variant="default" size="sm" onClick={saveDraft} loading={busy === "draft"} disabled={!!busy}>
          {draftLabel}
        </Button>
        <Button variant="default" size="sm" onClick={saveTemplate} loading={busy === "template"} disabled={!!busy}>
          Save as template
        </Button>
      </div>
      {saved && (
        <p className="small muted" style={{ margin: 0 }}>
          {saved.label}{" "}
          {saved.url && (
            <a href={saved.url} target="_blank" rel="noreferrer">
              Open it
            </a>
          )}
          {props.mode === "review" && draftId && (
            <>
              {" "}
              <a href={`${config.appBase}/compare`} target="_blank" rel="noreferrer">
                Compare versions
              </a>
            </>
          )}
        </p>
      )}
      {showVendor && (
        <Button variant="default" size="sm" onClick={addToVendors} loading={busy === "vendor"} disabled={!!busy}>
          Add to vendor registry
        </Button>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
    </div>
  );
}
