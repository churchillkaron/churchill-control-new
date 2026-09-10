import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listProductionBatches({
  organization_id,
  organizationId,
  entity_id,
  entityId,
  limit = 500,
}) {
  const resolvedOrganizationId = organization_id || organizationId;
  const resolvedEntityId = entity_id || entityId || null;
  if (!resolvedOrganizationId) throw new Error("organization_id required");

  let query = supabaseAdmin
    .from("production_batches")
    .select("id, organization_id, entity_id, dish_id, quantity, remaining_quantity, total_cost, cost_per_unit, produced_at, created_by, reference_id, uom_id, recipe_batch_count, cost_basis")
    .eq("organization_id", resolvedOrganizationId)
    .order("produced_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 500, 1), 1000));
  if (resolvedEntityId) query = query.eq("entity_id", resolvedEntityId);

  const { data: batches, error: batchError } = await query;
  if (batchError) throw batchError;
  const productionBatches = batches || [];
  const dishIds = [...new Set(productionBatches.map((batch) => batch.dish_id).filter(Boolean))];
  if (!dishIds.length) return productionBatches.map((batch) => ({ ...batch, dish_name: null, dish_category: null, production_type: null }));

  let dishQuery = supabaseAdmin.from("dishes")
    .select("id, name, category, production_type, dish_code, recipe_output_quantity, recipe_output_uom_id")
    .eq("organization_id", resolvedOrganizationId)
    .in("id", dishIds);
  if (resolvedEntityId) dishQuery = dishQuery.eq("entity_id", resolvedEntityId);
  const { data: dishes, error: dishError } = await dishQuery;
  if (dishError) throw dishError;
  const dishesById = new Map((dishes || []).map((dish) => [dish.id, dish]));

  return productionBatches.map((batch) => {
    const dish = dishesById.get(batch.dish_id);
    return {
      ...batch,
      dish_name: dish?.name || null,
      dish_code: dish?.dish_code || null,
      dish_category: dish?.category || null,
      production_type: dish?.production_type || null,
      recipe_output_quantity: dish?.recipe_output_quantity ?? null,
      recipe_output_uom_id: dish?.recipe_output_uom_id || null,
    };
  });
}
