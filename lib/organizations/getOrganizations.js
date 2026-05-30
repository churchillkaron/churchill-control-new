import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function getOrganizations() {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq(
      "status",
      "active"
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    );

  if (error) {

    console.error(
      "GET ORGANIZATIONS ERROR:",
      error
    );

    return [];

  }

  return data || [];

}
