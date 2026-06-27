import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function calculateDishCost({
  dish_id,
}) {

  try {

    const {
      data: recipeItems,
      error: recipeError,
    } = await supabaseAdmin
      .from("recipe_items")
      .select(`
        id,
        quantity_required,
        ingredients (
          id,
          name,
          cost,
          quantity
        )
      `)
      .eq(
        "dish_id",
        dish_id
      );

    if (recipeError) {
      throw recipeError;
    }

    let totalCost = 0;

    for (const recipe of recipeItems || []) {

      const ingredient =
        recipe.ingredients;

      const ingredientCost =
        Number(
          ingredient?.cost || 0
        );

      const ingredientQuantity =
        Number(
          ingredient?.quantity || 1
        );

      const required =
        Number(
          recipe.quantity_required || 0
        );

      const unitCost =
        ingredientQuantity > 0
          ? ingredientCost /
            ingredientQuantity
          : 0;

      totalCost +=
        unitCost *
        required;
    }

    const finalCost =
      Number(
        totalCost.toFixed(2)
      );

    // ===== UPDATE DISH =====
    const {
      data: updatedDish,
      error: updateError,
    } = await supabaseAdmin
      .from("dishes")
      .update({

        cost:
          finalCost,
      })
      .eq(
        "id",
        dish_id
      )
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    const price =
      Number(
        updatedDish.price || 0
      );

    const profit =
      price - finalCost;

    const foodCostPercent =
      price > 0
        ? (
            finalCost /
            price
          ) * 100
        : 0;

    return {

      success: true,

      dish_id,

      cost:
        finalCost,

      price,

      profit:
        Number(
          profit.toFixed(2)
        ),

      food_cost_percent:
        Number(
          foodCostPercent.toFixed(2)
        ),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
