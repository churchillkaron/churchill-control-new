import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function calculateOrderCost({
  order_items = [],
}) {

  let totalCost = 0

  const breakdown = []

  for (const item of order_items) {

    const {
      data: recipeItems,
      error,
    } = await supabaseAdmin
      .from('recipe_items')
      .select(`
        *,
        ingredients (
          id,
          name,
          cost_per_unit
        )
      `)
      .eq(
        'dish_id',
        item.dish_id
      )

    if (error) {
      throw error
    }

    let dishCost = 0

    for (const recipe of recipeItems) {

      const ingredientCost =
        Number(
          recipe.quantity || 0
        ) *
        Number(
          recipe.ingredients
            ?.cost_per_unit || 0
        ) *
        Number(
          item.quantity || 1
        )

      dishCost +=
        ingredientCost
    }

    totalCost +=
      dishCost

    breakdown.push({
      dish_id:
        item.dish_id,

      quantity:
        item.quantity,

      cost:
        Number(
          dishCost.toFixed(2)
        ),
    })
  }

  return {
    totalCost:
      Number(
        totalCost.toFixed(2)
      ),

    breakdown,
  }
}
