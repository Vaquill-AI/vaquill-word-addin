import { useState } from "react";
import { Button, Banner } from "@/ui/primitives";
import { MatterPicker } from "./MatterPicker";
import {
  importDraft,
  saveDraftToMatter,
  uploadTemplate,
  extractVendorFromDraft,
  createVendor,
  type ImportRedline,
  type VendorExtraction,
} from "@/api/platform";
import { ApiError } from "@/api/errors";
import { readDocumentText } from "@/office/document";
import { readDocumentBase64 } from "@/office/file";
import { textToTiptap } from "@/lib/tiptap";
import { config } from "@/config";
import type { RedlineSuggestion } from "@/api/types";
import type { DraftResult } from "@/api/drafting";

type Props = (
  | { mode: "review"; redlines: RedlineSuggestion[]; title: string; contractType?: string }
  | { mode: "draft"; draft: DraftResult }
) & {
  defaultMatterId?: string;
  /**
   * Fired after the contract is saved to Vaquill AI and a draft id is known
   * (or null if the save returned none). Lets a parent thread the id into the
   * governance sign-off so it can run the backend's authority-enforced approval.
   */
  onSaved?: (draftId: string | null) => void;
};

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
  const [vendorProposal, setVendorProposal] = useState<VendorExtraction | null>(null);

  async function saveDraft() {
    setBusy("draft");
    setError(null);
    setSaved(null);
    try {
      if (props.mode === "draft") {
        // The generated draft ALREADY exists (POST /generate persisted it with
        // its real DraftCategory + provenance). Re-importing it would create a
        // duplicate, mis-typed "custom" row and orphan the real one. Instead,
        // reuse the persisted id, optionally file it under a matter, and link.
        const id = props.draft.draftId;
        if (matterId) await saveDraftToMatter(id, matterId);
        setDraftId(id);
        props.onSaved?.(id);
        setSaved({
          label: matterId ? "Filed under the matter." : "Open your draft in Vaquill AI.",
          url: `${config.appBase}/drafting/${id}`,
        });
        return;
      }
      // Review mode: the reviewed contract is not yet a draft, so import it
      // (with redlines rendered as tracked changes).
      const text = await readDocumentText();
      const content = textToTiptap(text, { title: props.title });
      const ref = await importDraft({
        title: props.title,
        category: "custom",
        content,
        matter_id: matterId || undefined,
        redlines: mapRedlines(props.redlines),
      });
      setDraftId(ref.draftId ?? null);
      props.onSaved?.(ref.draftId ?? null);
      setSaved({
        label: "Saved to Vaquill AI with redlines.",
        url: ref.draftId ? `${config.appBase}/drafting/${ref.draftId}` : undefined,
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
      const ref = await uploadTemplate(base64, filename, title);
      const templateId = ref.templateId ?? ref.id;
      setSaved({
        label: "Saved as a template. Variables are being detected in the background.",
        url: templateId ? `${config.appBase}/templates/${templateId}` : undefined,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Step 1: extract a proposal (does not persist). Step 2: user confirms →
  // create. Previously this called extract and claimed "Added to registry"
  // even though nothing was saved (and the endpoint 404s when the feature is
  // disabled).
  async function proposeVendor() {
    if (!draftId) return;
    setBusy("vendor");
    setError(null);
    try {
      const { extraction } = await extractVendorFromDraft(draftId);
      setVendorProposal(extraction);
    } catch (e) {
      if (e instanceof ApiError && (e.kind === "not_found" || e.status === 404)) {
        setError("Vendor extraction isn't enabled for your account yet.");
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(null);
    }
  }

  async function confirmVendor() {
    if (!draftId || !vendorProposal) return;
    setBusy("vendor");
    setError(null);
    try {
      await createVendor({
        name: vendorProposal.vendorName?.trim() || "Untitled vendor",
        contactEmail: vendorProposal.contactEmail ?? undefined,
        isSubprocessor: vendorProposal.isSubprocessor ?? true,
        dataCategories: vendorProposal.dataCategories ?? [],
        linkDraftId: draftId,
      });
      setVendorProposal(null);
      setSaved({ label: "Added to the vendor / sub-processor registry." });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const showVendor = props.mode === "review" && looksLikeDpa(props.contractType) && !!draftId;
  const draftLabel =
    props.mode === "review"
      ? "Open in Vaquill AI (with redlines)"
      : matterId
        ? "File under matter"
        : "Open in Vaquill AI drafting";

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
      {showVendor && !vendorProposal && (
        <Button
          variant="default"
          size="sm"
          onClick={proposeVendor}
          loading={busy === "vendor"}
          disabled={!!busy}
        >
          Add to vendor registry
        </Button>
      )}
      {vendorProposal && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="small" style={{ margin: 0 }}>
            Create sub-processor{" "}
            <strong>{vendorProposal.vendorName || "Untitled vendor"}</strong> in the registry
            {vendorProposal.subProcessors && vendorProposal.subProcessors.length > 0
              ? ` (+${vendorProposal.subProcessors.length} sub-processors detected)`
              : ""}
            ?
          </p>
          <div className="row" style={{ gap: 8 }}>
            <Button
              variant="primary"
              size="sm"
              onClick={confirmVendor}
              loading={busy === "vendor"}
              disabled={!!busy}
            >
              Create vendor
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVendorProposal(null)}
              disabled={!!busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
    </div>
  );
}
