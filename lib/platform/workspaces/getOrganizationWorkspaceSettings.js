import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function getOrganizationWorkspaceSettings({
  organizationId,
}) {

  if (!organizationId) {
    return null;
  }

  const supabase =
    createServerSupabase();

  const {
    data,
    error,
  } = await supabase

    .from(
      "organization_workspace_settings"
    )

    .select("*")

    .eq(
      "organization_id",
      organizationId
    )

    .maybeSingle();

  if (error) {

    console.error(
      "organization workspace settings error",
      error
    );

    return null;

  }

  return data || null;

}
