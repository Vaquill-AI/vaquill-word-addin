import { useEffect, useState } from "react";
import { Button, Banner, Spinner } from "@/ui/primitives";
import {
  getPlaybookTemplates,
  createPlaybookFromTemplate,
  type PlaybookTemplate,
  type PlaybookDetail,
} from "@/api/playbooks";
import { ApiError, friendlyMessage } from "@/api/errors";

/** Create a playbook in one click from a starter template. */
export function TemplatePicker({
  onCreated,
  onClose,
}: {
  onCreated: (playbook: PlaybookDetail) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<PlaybookTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getPlaybookTemplates()
      .then((t) => alive && setTemplates(t))
      .catch((e) => {
        if (alive) setLoadError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function use(t: PlaybookTemplate) {
    setCreating(t.slug);
    setError(null);
    try {
      onCreated(await createPlaybookFromTemplate(t.slug));
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="card template-picker">
      <div className="row" style={{ justifyContent: "space-between", padding: "10px 12px" }}>
        <strong>New playbook from a template</strong>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>

      <div className="template-picker__body">
        {error && <Banner tone="danger">{error}</Banner>}
        {loadError && <Banner tone="danger">{loadError}</Banner>}
        {!templates && !loadError && (
          <div className="row" style={{ gap: 8 }}>
            <Spinner />
            <span className="small muted">Loading templates...</span>
          </div>
        )}
        {templates?.map((t) => (
          <div key={t.slug} className="template">
            <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <span className="template__name">{t.name}</span>
              {t.description && <span className="small muted">{t.description}</span>}
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => use(t)}
              loading={creating === t.slug}
              disabled={!!creating}
            >
              Use
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
