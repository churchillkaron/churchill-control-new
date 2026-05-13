import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function produceDishBatch({
  tenantId,
  dishId,
  quantity,
  referenceId,
  source = "PRODUCTION_BATCH",
}) {
  try {
    if (!tenantId || !dishId || !quantity || quantity <= 0) {
      return {
        success: false,
        error: "MISSING_REQUIRED_FIELDS",
      };
    }

    const { data: recipeItems, error: recipeError } =
      await supabaseAdmin
        .from("recipe_matrix")
        .select(`
          id,
          dish_id,
          ingredient_id,
          quantity,
          ingredient_name,
          cost_per_unit
        `)
        .eq("tenant_id", tenantId)
        .eq("dish_id", dishId);

    if (recipeError) throw recipeError;

    if (!recipeItems || recipeItems.length === 0) {
      return {
        success: false,
        error: "NO_RECIPE_FOUND",
      };
    }

    const deductions = [];

    for (const item of recipeItems) {
      const requiredQty =
        Number(item.quantity || 0) *
        Number(quantity);

      const { data: stockRow, error: stockError } =
        await supabaseAdmin
          .from("ingredient_stock")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("ingredient_id", item.ingredient_id)
          .single();

      if (stockError) throw stockError;

      const currentQty =
        Number(stockRow?.quantity || 0);

      if (currentQty < requiredQty) {
        return {
          success: false,
          error: "INSUFFICIENT_INGREDIENT_STOCK",
          ingredient_id: item.ingredient_id,
          ingredient_name: item.ingredient_name,
          current_quantity: currentQty,
          required_quantity: requiredQty,
        };
      }

      deductions.push({
        ...item,
        requiredQty,
        currentQty,
        newQty: currentQty - requiredQty,
      });
    }

    for (const item of deductions) {
      const { error: updateError } =
        await supabaseAdmin
          .from("ingredient_stock")
          .update({
            quantity: item.newQty,
          })
          .eq("tenant_id", tenantId)
          .eq("ingredient_id", item.ingredient_id);

      if (updateError) throw updateError;

      const { error: transactionError } =
        await supabaseAdmin
          .from("inventory_transactions")
          .insert({
            tenant_id: tenantId,
            ingredient_id: item.ingredient_id,
            quantity: item.requiredQty,
            change: -item.requiredQty,
            type: "PRODUCTION_CONSUMPTION",
            source,
            reference_id: referenceId || null,
            ingredient_name: item.ingredient_name,
          });

      if (transactionError) throw transactionError;
    }

    const { data: existingDishStock, error: dishStockError } =
      await supabaseAdmin
        .from("dish_stock")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("dish_id", dishId)
        .maybeSingle();

    if (dishStockError) throw dishStockError;

    if (existingDishStock) {
      const newDishQty =
        Number(existingDishStock.quantity || 0) +
        Number(quantity);

      const { error: updateDishError } =
        await supabaseAdmin
          .from("dish_stock")
          .update({
            quantity: newDishQty,
          })
          .eq("tenant_id", tenantId)
          .eq("dish_id", dishId);

      if (updateDishError) throw updateDishError;
    } else {
      const { error: insertDishError } =
        await supabaseAdmin
          .from("dish_stock")
          .insert({
            tenant_id: tenantId,
            dish_id: dishId,
            quantity: Number(quantity),
          });

      if (insertDishError) throw insertDishError;
    }

    // =========================
    // COSTING + BATCH LEDGER
    // =========================

    const totalCost = deductions.reduce(
      (sum, item) => {
        const ingredientCost =
          Number(item.cost_per_unit || 0);

        return (
          sum +
          ingredientCost * item.requiredQty
        );
      },
      0
    );

    const costPerUnit =
      Number(quantity) > 0
        ? totalCost / Number(quantity)
        : 0;

    const { error: batchError } =
      await supabaseAdmin
        .from("production_batches")
        .insert({
          tenant_id: tenantId,
          dish_id: dishId,
          quantity: Number(quantity),
          total_cost: totalCost,
          cost_per_unit: costPerUnit,
          produced_at: new Date().toISOString(),
          reference_id: referenceId || null,
        });

    if (batchError) throw batchError;

    return {
      success: true,
      dish_id: dishId,
      produced_quantity: Number(quantity),
      total_cost: totalCost,
      cost_per_unit: costPerUnit,
      ingredient_deductions: deductions.map(
        (item) => ({
          ingredient_id: item.ingredient_id,
          ingredient_name: item.ingredient_name,
          deducted_quantity: item.requiredQty,
          previous_quantity: item.currentQty,
          new_quantity: item.newQty,
        })
      ),
    };
  } catch (error) {
    console.error(
      "PRODUCE DISH BATCH ERROR:",
      error
    );

    return {
      success: false,
      error: error.message,
    };
  }
}