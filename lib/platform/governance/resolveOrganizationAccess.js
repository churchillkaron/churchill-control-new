import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function resolveOrganizationAccess({
  memberships = [],
  isSuperAdmin = false,
  tenantId,
}) {
  const supabase =
    createServerSupabase();

  if (isSuperAdmin) {
    const {
      data,
      error,
    } = await supabase
      .from("organizations")
      .select("*")
      .eq("status", "active");

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      organizations: data || [],
    };
  }

  const membershipOrganizationIds =
    (memberships || [])
      .map(item => item.organization_id)
      .filter(Boolean);

  if (!membershipOrganizationIds.length) {
    return {
      success: true,
      organizations: [],
    };
  }

  const {
    data: directOrganizations,
    error: directError,
  } = await supabase
    .from("organizations")
    .select("*")
    .in("id", membershipOrganizationIds)
    .eq("status", "active");

  if (directError) {
    return {
      success: false,
      error: directError.message,
    };
  }

  const direct =
    directOrganizations || [];

  const accountingFirmIds =
    direct
      .filter(
        item =>
          item.organization_type ===
          "accounting_firm"
      )
      .map(item => item.id);

  let clientOrganizations = [];

  if (accountingFirmIds.length) {
    const {
      data: relationships,
      error: relationshipError,
    } = await supabase
      .from("organization_relationships")
      .select("*")
      .in("source_organization_id", accountingFirmIds)
      .eq("relationship_type", "accounting_provider")
      .eq("status", "ACTIVE");

    if (relationshipError) {
      return {
        success: false,
        error: relationshipError.message,
      };
    }

    const clientIds =
      (relationships || [])
        .map(item => item.target_organization_id)
        .filter(Boolean);

    if (clientIds.length) {
      const {
        data: clients,
        error: clientError,
      } = await supabase
        .from("organizations")
        .select("*")
        .in("id", clientIds)
        .eq("status", "active");

      if (clientError) {
        return {
          success: false,
          error: clientError.message,
        };
      }

      clientOrganizations =
        clients || [];
    }
  }

  const deduplicated =
    Object.values(
      [
        ...direct,
        ...clientOrganizations,
      ].reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {})
    );

  return {
    success: true,
    organizations: deduplicated,
  };
}
