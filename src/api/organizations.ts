import { getSupabase } from "@/auth/supabase";
import { getUser } from "@/auth/session";

/**
 * List the organizations the signed-in user is an ACTIVE member of (owned or
 * member-of), so the org switcher can offer every workspace.
 *
 * Reads `organization_members` with the org name embedded. This relies on two
 * RLS policies that were previously broken and fixed in the DB migration
 * `fix_org_members_rls_recursion`:
 *   1. The `organization_members` SELECT policy used to sub-select itself,
 *      throwing Postgres 42P17 (infinite recursion) under a user JWT; the fix
 *      routes it through the SECURITY DEFINER helper `user_organization_ids()`.
 *   2. `organizations` SELECT was owner-only, so a member could not read the
 *      name of an org they belong to; the fix adds a member-visibility policy.
 * Before that migration this call errored and returned [], which silently hid
 * the switcher for everyone.
 */
export interface Org {
  id: string;
  name: string;
  role?: string | null;
}

interface MemberRow {
  role: string | null;
  organizations: { id: string; name: string } | { id: string; name: string }[] | null;
}

export async function listMyOrganizations(): Promise<Org[]> {
  const user = getUser();
  if (!user) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error || !data) return [];

  const orgs: Org[] = [];
  for (const row of data as unknown as MemberRow[]) {
    // Supabase types the embedded relation as an object or array depending on
    // the FK shape; normalize both.
    const rel = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    if (rel?.id) orgs.push({ id: rel.id, name: rel.name || "Organization", role: row.role });
  }
  // Stable, human order.
  orgs.sort((a, b) => a.name.localeCompare(b.name));
  return orgs;
}
