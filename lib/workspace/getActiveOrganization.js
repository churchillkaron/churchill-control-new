import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function getActiveOrganization(
  organizationId
) {

  const supabase =
    createServerSupabase();

  const {
    data,
    error,
  } = await supabase

    .from(
      "organizations"
    )

    .select("*")

    .eq(
      "id",
      organizationId
    )

    .single();

  if (error) {

    console.error(
      "getActiveOrganization:",
      error
    );

    return null;

  }

  return data;

}
