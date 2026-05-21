import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function executeConsumptionDeduction({
  tenantId,
  dishId,
  quantity = 1,
  referenceId,
  source = "production",
}) {
  try {
    if (!tenantId || !dishId || !referenceId) {
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
          ingredient_name
        `)
        .eq("tenant_id", tenantId)
        .eq("dish_id", dishId);

    if (recipeError) throw recipeError;

    if (!recipeItems || recipeItems.length === 0) {
      return {
        success: false,
        skipped: true,
        reason: "NO_RECIPE_FOUND",
      };
    }

    const results = [];

    for (const item of recipeItems) {
      const deductQty =
        Number(item.quantity || 0) *
        Number(quantity || 1);

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

      const newQty = currentQty - deductQty;

      if (newQty < 0) {
        return {
          success: false,
          error: "INSUFFICIENT_STOCK",
          ingredient_id: item.ingredient_id,
          ingredient_name: item.ingredient_name,
          current_quantity: currentQty,
          required_quantity: deductQty,
        };
      }

      const { error: updateError } =
        await supabaseAdmin
          .from("ingredient_stock")
          .update({
            quantity: newQty,
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
            quantity: deductQty,
            change: -deductQty,
            type: "CONSUMPTION",
            source,
            reference_id: referenceId,
            ingredient_name: item.ingredient_name,
          });

      if (transactionError)
        throw transactionError;

      results.push({
        ingredient_id: item.ingredient_id,
        ingredient_name: item.ingredient_name,
        deducted_quantity: deductQty,
        previous_quantity: currentQty,
        new_quantity: newQty,
      });
    }

    return {
      success: true,
      dish_id: dishId,
      quantity,
      deductions: results,
    };
  } catch (error) {
    console.error(
      "EXECUTE CONSUMPTION DEDUCTION ERROR:",
      error
    );

    return {
      success: false,
      error: error.message,
    };
  }
}
