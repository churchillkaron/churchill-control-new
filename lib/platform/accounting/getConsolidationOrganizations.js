import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function getConsolidationOrganizations({
  organizationId,
}) {

  const supabase =
    createServerSupabase();

  // =====================================
  // LOAD PROFILE
  // =====================================

  const {
    data: profile,
    error: profileError,
  } = await supabase

    .from(
      "organization_accounting_profiles"
    )

    .select("*")

    .eq(
      "organization_id",
      organizationId
    )

    .single();

  if (profileError) {

    return {
      success: false,
      error: profileError.message,
    };

  }

  // =====================================
  // STANDALONE
  // =====================================

  if (
    profile.accounting_mode ===
    "standalone_entity"
  ) {

    return {

      success: true,

      organizations: [
        organizationId,
      ],

    };

  }

  // =====================================
  // CONSOLIDATION ENTITY
  // =====================================

  if (
    profile.accounting_mode ===
    "consolidation_entity"
  ) {

    const {
      data: children,
      error: childError,
    } = await supabase

      .from(
        "organization_accounting_profiles"
      )

      .select("*")

      .eq(
        "consolidation_parent_id",
        organizationId
      );

    if (childError) {

      return {
        success: false,
        error: childError.message,
      };

    }

    return {

      success: true,

      organizations: [

        organizationId,

        ...(children || [])
          .map(
            item =>
              item.organization_id
          ),

      ],

    };

  }

  // =====================================
  // OPERATIONAL ENTITY
  // =====================================

  return {

    success: true,

    organizations: [
      organizationId,
    ],

  };

}
