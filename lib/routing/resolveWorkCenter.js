import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function resolveWorkCenter({
  organizationId,
  dishId,
}) {
  if (!organizationId || !dishId) {
    return null;
  }

  const { data: route, error } =
    await supabaseAdmin
      .from("work_center_routes")
      .select(`
        work_center_id
      `)
      .eq("organization_id", organizationId)
      .eq("source_type", "DISH")
      .eq("source_id", dishId)
      .eq("active", true)
      .order("priority", {
        ascending: true,
      })
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return route?.work_center_id || null;
}
