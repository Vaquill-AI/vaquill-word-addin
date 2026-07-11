import { useEffect, useState } from "react";
import { listMyOrganizations, type Org } from "@/api/organizations";
import { getActiveOrgId, setActiveOrgId } from "@/lib/org";

/**
 * Active-organization selector shown in the header. Lets a multi-org user pick
 * which workspace's matters, drafts, playbooks, and clients the add-in reads and
 * writes. Hides itself when the user belongs to no organizations (nothing to
 * switch). Changing it updates the store; the app shell remounts the data views
 * so they refetch under the new X-Organization-ID.
 */
export function OrgSwitcher() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [value, setValue] = useState<string>(getActiveOrgId() ?? "");

  useEffect(() => {
    let alive = true;
    listMyOrganizations()
      .then((list) => {
        if (!alive) return;
        setOrgs(list);
        // Make the active org explicit + visible. If nothing is selected yet,
        // default to the persisted value (if still a member) or the first org.
        const current = getActiveOrgId();
        const stillMember = current && list.some((o) => o.id === current);
        if (!stillMember && list.length > 0) {
          setActiveOrgId(list[0].id);
          setValue(list[0].id);
        } else if (current) {
          setValue(current);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (orgs.length === 0) return null;

  return (
    <select
      className="org-switcher"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        setActiveOrgId(v || null);
      }}
      title="Active organization"
      aria-label="Active organization"
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
