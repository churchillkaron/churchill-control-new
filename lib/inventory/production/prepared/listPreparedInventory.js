import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listPreparedInventory({ organizationId, entityId = null }) {
  if (!organizationId) throw new Error("Organization ID is required");
  let query = supabaseAdmin.from("production_batches")
    .select("id,dish_id,quantity,remaining_quantity,total_cost,cost_per_unit,produced_at,reference_id,organization_id,entity_id,uom_id,recipe_batch_count,cost_basis")
    .eq("organization_id", organizationId)
    .gt("remaining_quantity", 0)
    .order("produced_at", { ascending: false });
  if (entityId) query = query.eq("entity_id", entityId);
  const { data: batches, error: batchError } = await query;
  if (batchError) throw batchError;
  const rows = batches || [];
  if (!rows.length) return [];

  const dishIds = [...new Set(rows.map((row) => row.dish_id).filter(Boolean))];
  const uomIds = [...new Set(rows.map((row) => row.uom_id).filter(Boolean))];
  const [{ data: dishes, error: dishError }, { data: uoms, error: uomError }] = await Promise.all([
    supabaseAdmin.from("dishes").select("id,name,dish_code,production_type,recipe_output_quantity,recipe_output_uom_id").eq("organization_id", organizationId).in("id", dishIds),
    uomIds.length ? supabaseAdmin.from("inventory_uoms").select("id,name,abbreviation").in("id", uomIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (dishError) throw dishError;
  if (uomError) throw uomError;
  const dishMap = new Map((dishes || []).filter((dish) => dish.production_type === "BATCH").map((dish) => [dish.id, dish]));
  const uomMap = new Map((uoms || []).map((uom) => [uom.id, uom]));

  return rows.filter((row) => dishMap.has(row.dish_id)).map((row) => {
    const dish = dishMap.get(row.dish_id), uom = uomMap.get(row.uom_id);
    return { id: row.id, batch_id: row.id, dish_id: row.dish_id, dish_code: dish.dish_code || null, item_name: dish.name, quantity: row.remaining_quantity, original_quantity: row.quantity, unit: uom?.abbreviation || uom?.name || null, uom_id: row.uom_id, total_cost: row.total_cost, cost_per_unit: row.cost_per_unit, recipe_batch_count: row.recipe_batch_count, cost_basis: row.cost_basis, production_date: row.produced_at, created_at: row.produced_at, reference_id: row.reference_id, organization_id: row.organization_id, entity_id: row.entity_id };
  });
}
