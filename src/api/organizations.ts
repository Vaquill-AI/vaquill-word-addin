import { getSupabase } from "@/auth/supabase";
import { getUser } from "@/auth/session";

/**
 * List the organizations the signed-in user is an ACTIVE member of.
 *
 * There is no REST endpoint for this (the main app reads it from Supabase
 * directly), so we query the same tables through the add-in's authenticated
 * Supabase client. RLS scopes rows to the caller; we also filter by user_id
 * defensively. Used by the org switcher in the header.
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
