import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listPreparedInventory({ organizationId }) {
  if (!organizationId) {
    throw new Error("Organization ID is required");
  }

  const { data, error } = await supabaseAdmin
    .from("prepared_inventory")
    .select(
      "id, batch_id, item_name, quantity, unit, created_at, production_date, expiry_date, shelf_life_days, spoilage_quantity, organization_id",
    )
    .eq("organization_id", organizationId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  return data || [];
}
