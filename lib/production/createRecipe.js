import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

// =====================================
// CREATE RECIPE
// =====================================

export async function createRecipe({

  dishId,

  ingredients,

}) {

  if (!dishId) {

    throw new Error(
      "dishId required"
    );

  }

  // -----------------------------------
  // DELETE OLD RECIPE
  // -----------------------------------

  await supabaseAdmin

    .from("recipe_items")

    .delete()

    .eq(
      "dish_id",
      dishId
    );

  // -----------------------------------
  // INSERT NEW ITEMS
  // -----------------------------------

  const rows =
    (ingredients || []).map(

      (item) => ({

        dish_id:
          dishId,

        ingredient_id:
          item.ingredient_id,

        quantity:
          Number(
            item.quantity || 0
          ),

      })

    );

  if (rows.length > 0) {

    const {
      error,
    } = await supabaseAdmin

      .from("recipe_items")

      .insert(rows);

    if (error) {

      throw error;

    }

  }

  return {

    success: true,

  };

}