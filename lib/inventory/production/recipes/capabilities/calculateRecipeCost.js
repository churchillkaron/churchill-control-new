import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text = (value) => String(value ?? "").trim();
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const MAX_RECIPE_DEPTH = 12;

function physicalUomFactor(source, target) {
  if (!source?.id || !target?.id) return null;
  if (text(source.id) === text(target.id)) return 1;
  const sourceDimension = text(source.dimension).toUpperCase();
  const targetDimension = text(target.dimension).toUpperCase();
  const sourceFactor = num(source.factor_to_base);
  const targetFactor = num(target.factor_to_base);
  if (!sourceDimension || sourceDimension !== targetDimension || sourceDimension === "PACKAGE") return null;
  if (!(sourceFactor > 0) || !(targetFactor > 0)) return null;
  return sourceFactor / targetFactor;
}

async function loadDish({ organizationId, entityId, dishId }) {
  const { data, error } = await supabaseAdmin.from("dishes")
    .select("id,name,price,cost,dish_code,production_type,recipe_output_quantity,recipe_output_uom_id,organization_id,entity_id")
    .eq("organization_id", organizationId).eq("entity_id", entityId).eq("id", dishId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("dish unavailable for organization/entity");
  return data;
}

async function loadRecipeRows({ organizationId, entityId, dishId }) {
  const { data, error } = await supabaseAdmin.from("recipe_items")
    .select("id,item_id,component_dish_id,quantity,uom_id,unit,yield_percent")
    .eq("organization_id", organizationId).eq("entity_id", entityId).eq("dish_id", dishId);
  if (error) throw error;
  if (!(data || []).length) throw new Error("dish has no recipe components");
  return data;
}

async function calculateNode({ organizationId, entityId, dishId, path = [], cache = new Map() }) {
  if (path.includes(dishId)) throw new Error(`recipe component cycle detected at ${dishId}`);
  if (path.length >= MAX_RECIPE_DEPTH) throw new Error("recipe component depth exceeds 12");
  if (cache.has(dishId)) return cache.get(dishId);

  const dish = await loadDish({ organizationId, entityId, dishId });
  const rows = await loadRecipeRows({ organizationId, entityId, dishId });
  const itemIds = [...new Set(rows.map((row) => text(row.item_id)).filter(Boolean))];
  const componentIds = [...new Set(rows.map((row) => text(row.component_dish_id)).filter(Boolean))];
  const { data: itemRows, error: itemError } = itemIds.length
    ? await supabaseAdmin.from("inventory_items").select("id,name,code,cost,uom_id,is_active")
      .eq("organization_id", organizationId).eq("entity_id", entityId).in("id", itemIds)
    : { data: [], error: null };
  if (itemError) throw itemError;
  const items = new Map((itemRows || []).map((row) => [text(row.id), row]));

  const componentDishes = new Map();
  if (componentIds.length) {
    const { data, error } = await supabaseAdmin.from("dishes")
      .select("id,name,dish_code,production_type,recipe_output_quantity,recipe_output_uom_id")
      .eq("organization_id", organizationId).eq("entity_id", entityId).in("id", componentIds);
    if (error) throw error;
    for (const row of data || []) componentDishes.set(text(row.id), row);
  }

  const uomIds = [...new Set([
    ...rows.map((row) => text(row.uom_id)),
    ...(itemRows || []).map((row) => text(row.uom_id)),
    ...[...componentDishes.values()].map((row) => text(row.recipe_output_uom_id)),
  ].filter(Boolean))];
  const { data: uomRows, error: uomError } = uomIds.length
    ? await supabaseAdmin.from("inventory_uoms").select("id,name,abbreviation,dimension,factor_to_base,organization_id").in("id", uomIds)
    : { data: [], error: null };
  if (uomError) throw uomError;
  const uoms = new Map((uomRows || []).map((row) => [text(row.id), row]));

  const { data: conversionRows, error: conversionError } = itemIds.length
    ? await supabaseAdmin.from("inventory_item_uom_conversions")
      .select("item_id,from_uom_id,factor_to_item_base").eq("organization_id", organizationId).eq("entity_id", entityId).in("item_id", itemIds)
    : { data: [], error: null };
  if (conversionError) throw conversionError;
  const conversions = new Map((conversionRows || []).map((row) => [`${row.item_id}|${row.from_uom_id}`, num(row.factor_to_item_base)]));

  let ingredientCost = 0;
  const breakdown = [];
  for (const row of rows) {
    const itemId = text(row.item_id);
    const componentDishId = text(row.component_dish_id);
    if (Boolean(itemId) === Boolean(componentDishId)) throw new Error("recipe line must reference exactly one inventory item or component recipe");
    const quantity = num(row.quantity);
    const yieldPercent = num(row.yield_percent) || 100;
    if (!(quantity > 0) || !(yieldPercent > 0 && yieldPercent <= 100)) throw new Error("invalid recipe component quantity or yield");

    if (itemId) {
      const item = items.get(itemId);
      if (!item || item.is_active === false) throw new Error("recipe inventory item unavailable");
      let factor = 1;
      if (row.uom_id && item.uom_id && text(row.uom_id) !== text(item.uom_id)) {
        factor = physicalUomFactor(uoms.get(text(row.uom_id)), uoms.get(text(item.uom_id))) || conversions.get(`${item.id}|${row.uom_id}`) || 0;
        if (!(factor > 0)) throw new Error(`recipe UOM conversion unresolved for item ${item.code || item.id}`);
      }
      const purchaseQuantity = (quantity * factor) / (yieldPercent / 100);
      const componentCost = purchaseQuantity * num(item.cost);
      ingredientCost += componentCost;
      breakdown.push({ type: "inventory_item", item_id: item.id, item_code: item.code || null, item_name: item.name, quantity, uom_id: row.uom_id || item.uom_id || null, factor_to_item_base: factor, yield_percent: yieldPercent, purchase_quantity_in_item_base: Number(purchaseQuantity.toFixed(4)), base_unit_cost: num(item.cost), component_cost: Number(componentCost.toFixed(4)) });
      continue;
    }

    const componentDish = componentDishes.get(componentDishId);
    if (!componentDish) throw new Error("component recipe unavailable for organization/entity");
    const outputQuantity = num(componentDish.recipe_output_quantity);
    const outputUomId = text(componentDish.recipe_output_uom_id);
    if (!(outputQuantity > 0) || !outputUomId) throw new Error(`component recipe ${componentDish.dish_code || componentDish.id} needs output quantity and UOM`);
    const sourceUomId = text(row.uom_id) || outputUomId;
    const sourceUom = uoms.get(sourceUomId);
    const outputUom = uoms.get(outputUomId);
    const factorToOutputUom = physicalUomFactor(sourceUom, outputUom) || (sourceUomId === outputUomId ? 1 : 0);
    if (!(factorToOutputUom > 0)) throw new Error(`component recipe UOM conversion unresolved for ${componentDish.dish_code || componentDish.id}`);
    const child = await calculateNode({ organizationId, entityId, dishId: componentDishId, path: [...path, dishId], cache });
    const batchFraction = ((quantity * factorToOutputUom) / outputQuantity) / (yieldPercent / 100);
    const componentCost = child.total_cost * batchFraction;
    ingredientCost += componentCost;
    breakdown.push({ type: "component_recipe", component_dish_id: componentDishId, component_dish_code: componentDish.dish_code || null, component_name: componentDish.name, quantity, uom_id: sourceUomId, output_quantity: outputQuantity, output_uom_id: outputUomId, yield_percent: yieldPercent, batch_fraction: Number(batchFraction.toFixed(8)), component_recipe_cost: child.total_cost, component_cost: Number(componentCost.toFixed(4)), nested_breakdown: child.breakdown });
  }

  const result = { dish_id: dishId, dish_code: dish.dish_code || null, dish_name: dish.name, production_type: dish.production_type || null, recipe_output_quantity: dish.recipe_output_quantity == null ? null : num(dish.recipe_output_quantity), recipe_output_uom_id: dish.recipe_output_uom_id || null, ingredient_cost: Number(ingredientCost.toFixed(4)), total_cost: Number(ingredientCost.toFixed(4)), breakdown };
  cache.set(dishId, result);
  return result;
}

export async function calculateRecipeCost({ organizationId, organization_id, entityId, entity_id, dishId, dish_id, recipeId, laborCost = 0, overheadCost = 0, sellingPrice = null } = {}) {
  const org = text(organizationId || organization_id), entity = text(entityId || entity_id), dishKey = text(dishId || dish_id || recipeId);
  if (!org) throw new Error("organizationId required");
  if (!entity) throw new Error("entityId required");
  if (!dishKey) throw new Error("dishId required");
  const node = await calculateNode({ organizationId: org, entityId: entity, dishId: dishKey });
  const labor = num(laborCost), overhead = num(overheadCost), total = node.ingredient_cost + labor + overhead;
  const dish = await loadDish({ organizationId: org, entityId: entity, dishId: dishKey });
  const price = sellingPrice == null ? num(dish.price) : num(sellingPrice);
  const margin = price - total;
  return { ...node, labor_cost: labor, overhead_cost: overhead, total_cost: Number(total.toFixed(4)), selling_price: price, gross_margin: Number(margin.toFixed(4)), gross_margin_percent: price > 0 ? Number(((margin / price) * 100).toFixed(2)) : 0, food_cost_percent: price > 0 ? Number(((total / price) * 100).toFixed(2)) : 0, cost_basis: "CANONICAL_RECIPE_GRAPH_WITH_YIELD_V3" };
}

export default calculateRecipeCost;
