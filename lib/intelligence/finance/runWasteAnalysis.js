import { supabase } from "@/lib/supabase";

export async function runWasteAnalysis({
  tenantId,
  itemId,
  wasteQuantity,
  averageCost,
  wasteReason,
}) {
  const wasteValue =
    Number(wasteQuantity || 0) *
    Number(averageCost || 0);

  const { data, error } =
    await supabase
      .from("waste_analysis")
      .insert({
        tenant_id: tenantId,
        item_id: itemId,
        waste_quantity:
          wasteQuantity,
        waste_value:
          wasteValue,
        waste_reason:
          wasteReason,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
