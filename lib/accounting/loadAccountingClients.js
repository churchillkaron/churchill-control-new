import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function loadAccountingClients({
  organizationId,
}) {

  const {
    data: relationships,
    error,
  } = await supabaseAdmin
    .from("organization_relationships")
    .select("*")
    .eq("source_organization_id", organizationId)
    .eq("relationship_type", "accounting_provider")
    .eq("status", "ACTIVE");

  if (error) {
    throw error;
  }

  const ids =
    (relationships || []).map(
      item => item.target_organization_id
    );

  if (!ids.length) {
    return [];
  }

  const {
    data: organizations,
    error: orgError,
  } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .in("id", ids);

  if (orgError) {
    throw orgError;
  }

  const {
    data: profiles,
  } = await supabaseAdmin
    .from("accounting_client_profiles")
    .select("*")
    .in("organization_id", ids);

  const {
    data: engagements,
  } = await supabaseAdmin
    .from("accounting_engagements")
    .select("*")
    .in("organization_id", ids);

  return (organizations || []).map(org => {

    const profile =
      (profiles || []).find(
        item => item.organization_id === org.id
      ) || null;

    const engagement =
      (engagements || []).find(
        item => item.organization_id === org.id
      ) || null;

    return {
      ...org,
      profile,
      engagement,
    };

  });
}
