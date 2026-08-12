import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listProductionBatches({
  organization_id,
  organizationId,
  limit = 500,
}) {
  const resolvedOrganizationId = organization_id || organizationId;

  if (!resolvedOrganizationId) {
    throw new Error("organization_id required");
  }

  const { data: batches, error: batchError } = await supabaseAdmin
    .from("production_batches")
    .select(
      "id, organization_id, dish_id, quantity, remaining_quantity, total_cost, cost_per_unit, produced_at, created_by, reference_id",
    )
    .eq("organization_id", resolvedOrganizationId)
    .order("produced_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 500, 1), 1000));

  if (batchError) {
    throw batchError;
  }

  const productionBatches = batches || [];
  const dishIds = [
    ...new Set(
      productionBatches
        .map((batch) => batch.dish_id)
        .filter(Boolean),
    ),
  ];

  if (dishIds.length === 0) {
    return productionBatches.map((batch) => ({
      ...batch,
      dish_name: null,
      dish_category: null,
    }));
  }

  const { data: dishes, error: dishError } = await supabaseAdmin
    .from("dishes")
    .select("id, name, category")
    .eq("organization_id", resolvedOrganizationId)
    .in("id", dishIds);

  if (dishError) {
    throw dishError;
  }

  const dishesById = new Map(
    (dishes || []).map((dish) => [dish.id, dish]),
  );

  return productionBatches.map((batch) => {
    const dish = dishesById.get(batch.dish_id);

    return {
      ...batch,
      dish_name: dish?.name || null,
      dish_category: dish?.category || null,
    };
  });
}
