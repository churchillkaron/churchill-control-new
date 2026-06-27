import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GetTables({
  organizationId,
}) {
  const { data, error } =
    await supabaseAdmin
      .from("restaurant_tables")
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .order("table_number");

  if (error) throw error;

  return data || [];
}
