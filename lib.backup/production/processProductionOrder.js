import {
  calculateRecipeUsage,
} from "./calculateRecipeUsage";

export async function processProductionOrder(
  supabase,
  orderItem,
  recipeItems
) {

  const usage =
    calculateRecipeUsage(
      recipeItems,
      orderItem.quantity
    );

  let totalCost = 0;

  for (
    const ingredient of usage
  ) {

    totalCost +=
      Number(
        ingredient.cost || 0
      );

    await supabase

      .from("inventory_items")

      .update({

        quantity:
          supabase.raw(
            `quantity - ${ingredient.usage_quantity}`
          ),

      })

      .eq(
        "id",
        ingredient.ingredient_id
      );

    await supabase

      .from(
        "inventory_movements"
      )

      .insert({

        ingredient_id:
          ingredient.ingredient_id,

        ingredient_name:
          ingredient.ingredient_name,

        movement_type:
          "CONSUMPTION",

        quantity:
          ingredient.usage_quantity,

        unit:
          ingredient.unit,

        reference_type:
          "ORDER_ITEM",

        reference_id:
          orderItem.id,

        created_at:
          new Date().toISOString(),

      });

  }

  await supabase

    .from("order_items")

    .update({

      production_cost:
        totalCost,

    })

    .eq(
      "id",
      orderItem.id
    );

  return {

    success: true,

    totalCost,

    usage,

  };

}
