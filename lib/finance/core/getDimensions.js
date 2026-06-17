import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getDimensions({
  tenantId,
  dimensionType,
}) {
  let query = supabase
    .from("accounting_dimensions")
    .select("*")
    .eq("tenant_id", tenantId);

  if (dimensionType) {
    query = query.eq(
      "dimension_type",
      dimensionType
    );
  }

  const { data, error } = await query.order(
    "dimension_code",
    {
      ascending: true,
    }
  );

  if (error) {
    throw error;
  }

  return data;
}
