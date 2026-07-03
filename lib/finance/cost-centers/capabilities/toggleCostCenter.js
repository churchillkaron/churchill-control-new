import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function toggleCostCenter({
  organization_id,
  cost_center_id,
  updated_by = "system",
}) {
  const {
    data: center,
    error: loadError,
  } = await supabaseAdmin
    .from("cost_centers")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("id", cost_center_id)
    .single();

  if (loadError || !center) {
    throw new Error("COST_CENTER_NOT_FOUND");
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("cost_centers")
    .update({
      is_active: !center.is_active,
      updated_at: new Date().toISOString(),
      updated_by,
    })
    .eq("id", center.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  await supabaseAdmin
    .from("audit_logs")
    .insert([{
      organization_id,
      action: data.is_active
        ? "COST_CENTER_ACTIVATED"
        : "COST_CENTER_DEACTIVATED",
      entity_type: "cost_center",
      entity_id: center.id,
      metadata: {
        code: center.code,
        name: center.name,
        updated_by,
      },
    }]);

  return {
    success: true,
    costCenter: data,
  };
}
