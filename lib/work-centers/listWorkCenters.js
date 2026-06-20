import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listWorkCenters({
  organizationId,
}) {
  if (!organizationId) {
    return {
      success: false,
      error: "Missing organizationId",
      data: [],
    };
  }

  const { data, error } = await supabaseAdmin
    .from("work_centers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }

  return {
    success: true,
    data: data || [],
  };
}
