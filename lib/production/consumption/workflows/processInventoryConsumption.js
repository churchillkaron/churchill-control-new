import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function processInventoryConsumption({
  tenant_id,
  order_item_id,
  dish_id,
  quantity = 1,
}) {

  try {

    // ===== LOAD RECIPE =====
    const {
      data: recipeItems,
      error: recipeError,
    } = await supabaseAdmin
      .from("recipe_items")
      .select(`
        id,
        ingredient_id,
        quantity_required,
        ingredients (
          id,
          name,
          quantity,
          unit,
          cost
        )
      `)
      .eq(
        "dish_id",
        dish_id
      );

    if (recipeError) {
      throw recipeError;
    }

    // ===== CONSUME INVENTORY =====
    for (const recipe of recipeItems || []) {

      const required =
        Number(
          recipe.quantity_required || 0
        ) * Number(quantity || 0);

      const ingredient =
        recipe.ingredients;

      const currentStock =
        Number(
          ingredient.quantity || 0
        );

      const newStock =
        currentStock - required;

      // ===== UPDATE INGREDIENT =====
      const {
        error: updateError,
      } = await supabaseAdmin
        .from("ingredients")
        .update({

          quantity:
            newStock,
        })
        .eq(
          "id",
          ingredient.id
        );

      if (updateError) {
        throw updateError;
      }

      // ===== INVENTORY LEDGER =====
      const {
        error: ledgerError,
      } = await supabaseAdmin
        .from(
          "inventory_ledger"
        )
        .insert([
          {

            tenant_id,

            ingredient_id:
              ingredient.id,

            ingredient_name:
              ingredient.name,

            movement_type:
              "CONSUMPTION",

            quantity:
              required,

            previous_quantity:
              currentStock,

            new_quantity:
              newStock,

            reference_type:
              "ORDER_ITEM",

            reference_id:
              order_item_id,

            created_at:
              new Date().toISOString(),
          },
        ]);

      if (ledgerError) {
        throw ledgerError;
      }
    }

    return {

      success: true,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
