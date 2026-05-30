import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function getOrganizationAccountingProfile({
  organizationId,
}) {

  if (!organizationId) {

    return {
      success: false,
      error: "Missing organizationId",
    };

  }

  const supabase =
    createServerSupabase();

  const {
    data,
    error,
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

  if (error) {

    return {
      success: false,
      error: error.message,
    };

  }

  return {

    success: true,

    profile:
      data,

  };

}
