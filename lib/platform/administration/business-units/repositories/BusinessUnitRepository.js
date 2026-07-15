import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getBusinessUnits(
  organization_id
) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("business_units")
    .select("*")
    .eq("organization_id", organization_id)
    .order("name");

  if (error) {
    throw error;
  }

  return data || [];

}
