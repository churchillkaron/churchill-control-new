import { supabase } from "@/lib/shared/supabase/client";

export async function processCompletedOrder(
  order_id,
  tenant_id
) {

  if (
    !order_id ||
    !tenant_id
  ) {

    return {
      success: false,
    };
  }

  // ===== ORDER ITEMS =====
  const {
    data: items,
    error: itemsError,
  } = await supabase
    .from("order_items")
    .select("*")
    .eq(
      "order_id",
      order_id
    );

  if (
    itemsError ||
    !items
  ) {

    console.error(
      itemsError
    );

    return {
      success: false,
    };
  }

  // ===== LOOP ITEMS =====
  for (const item of items) {

    // ===== RECIPE =====
    const {
      data: recipe,
    } = await supabase
      .from("recipes")
      .select("*")
      .eq(
        "dish_id",
        item.dish_id
      )
      .single();

    if (!recipe) {
      continue;
    }

    // ===== RECIPE ITEMS =====
    const {
      data: recipeItems,
    } = await supabase
      .from("recipe_items")
      .select("*")
      .eq(
        "recipe_id",
        recipe.id
      );

    if (!recipeItems) {
      continue;
    }

    let totalCost = 0;

    // ===== INGREDIENT LOOP =====
    for (const recipeItem of recipeItems) {

      const {
        data: ingredient,
      } = await supabase
        .from("ingredients")
        .select("*")
        .eq(
          "id",
          recipeItem.ingredient_id
        )
        .single();

      if (!ingredient) {
        continue;
      }

      const usage =
        Number(
          recipeItem.quantity || 0
        ) *
        Number(
          item.quantity || 0
        );

      // ===== COST =====
      totalCost +=
        usage *
        Number(
          ingredient.cost_per_unit || 0
        );

      // ===== INVENTORY DEDUCTION =====
      const newStock =
        Number(
          ingredient.current_stock || 0
        ) - usage;

      await supabase
        .from("ingredients")
        .update({
          current_stock:
            newStock,
        })
        .eq(
          "id",
          ingredient.id
        );

      // ===== MOVEMENT =====
      await supabase
        .from(
          "inventory_movements"
        )
        .insert({

          tenant_id,

          ingredient_id:
            ingredient.id,

          movement_type:
            "ORDER_USAGE",

          quantity:
            usage,

          previous_stock:
            ingredient.current_stock,

          new_stock:
            newStock,

          reference_id:
            order_id,
        });
    }

    // ===== PRODUCTION RECORD =====
    await supabase
      .from(
        "production_logs"
      )
      .insert({

        tenant_id,

        order_id,

        dish_id:
          item.dish_id,

        quantity:
          item.quantity,

        sales_price:
          item.price,

        production_cost:
          totalCost,

        profit:
          Number(
            item.price || 0
          ) - totalCost,
      });
  }

  return {
    success: true,
  };
}
