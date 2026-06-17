import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { emitInventoryWasteEvent } from "@/lib/finance/core/emitInventoryWasteEvent";
import { recordSystemEvent } from "@/lib/events/recordSystemEvent";

export async function logWaste({
  tenantId,
  tenant_id,
  ingredient_id,
  quantity,
  reason,
  created_by,
  department = "production",
}) {
  const resolvedTenantId =
    tenantId || tenant_id;

  if (!resolvedTenantId) {
    throw new Error("tenantId required");
  }

  const wasteQty =
    Number(quantity || 0);

  if (wasteQty <= 0) {
    throw new Error("Invalid quantity");
  }

  const {
    data: ingredient,
    error: ingredientError,
  } = await supabaseAdmin
    .from("ingredients")
    .select("*")
    .eq("tenant_id", resolvedTenantId)
    .eq("id", ingredient_id)
    .single();

  if (ingredientError) {
    throw ingredientError;
  }

  const currentQty =
    Number(ingredient.quantity || 0);

  if (currentQty < wasteQty) {
    throw new Error(
      "Insufficient stock"
    );
  }

  const newQty =
    currentQty - wasteQty;

  const estimatedCost =
    Number(
      (
        wasteQty *
        Number(
          ingredient.cost_per_base_unit || 0
        )
      ).toFixed(2)
    );

  await supabaseAdmin
    .from("ingredients")
    .update({
      quantity: newQty,
    })
    .eq("tenant_id", resolvedTenantId)
    .eq("id", ingredient_id);

  const {
    data: wasteLog,
    error: wasteError,
  } = await supabaseAdmin
    .from("production_waste_logs")
    .insert({
      ingredient_id,
      quantity: wasteQty,
      estimated_cost:
        estimatedCost,
      reason:
        reason || null,
      created_by:
        created_by || "SYSTEM",
    })
    .select()
    .single();

  if (wasteError) {
    throw wasteError;
  }

  await supabaseAdmin
    .from("inventory_transactions")
    .insert({
      tenant_id:
        resolvedTenantId,
      ingredient_id,
      quantity:
        wasteQty,
      change:
        -wasteQty,
      type:
        "WASTE",
      source:
        "PRODUCTION_WASTE",
      reference_id:
        wasteLog.id,
      ingredient_name:
        ingredient.name,
    });

  await emitInventoryWasteEvent({
    tenantId:
      resolvedTenantId,
    wasteId:
      wasteLog.id,
    amount:
      estimatedCost,
    department,
    reason:
      reason || null,
    entryDate:
      new Date().toISOString(),
  });

  await recordSystemEvent({
    tenantId:
      resolvedTenantId,
    type:
      "INVENTORY_WASTE",
    payload: {
      waste_id:
        wasteLog.id,
      ingredient_id,
      ingredient_name:
        ingredient.name,
      quantity:
        wasteQty,
      estimated_cost:
        estimatedCost,
      previous_quantity:
        currentQty,
      new_quantity:
        newQty,
      reason:
        reason || null,
      created_by:
        created_by || "SYSTEM",
    },
  });

  return {
    success: true,
    wasteLog,
    estimatedCost,
    previous_quantity:
      currentQty,
    new_quantity:
      newQty,
  };
}
