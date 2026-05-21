import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function deductInventoryFromOrder({
  order_items = [],
}) {

  const results = []

  for (const item of order_items) {

    const {
      data: recipeItems,
      error: recipeError,
    } = await supabaseAdmin
      .from('recipe_items')
      .select('*')
      .eq(
        'dish_id',
        item.dish_id
      )

    if (recipeError) {
      throw recipeError
    }

    for (const recipe of recipeItems) {

      const deduction =
        Number(
          recipe.quantity || 0
        ) *
        Number(
          item.quantity || 1
        )

      const {
        data: ingredient,
        error:
          ingredientError,
      } = await supabaseAdmin
        .from('ingredients')
        .select('*')
        .eq(
          'id',
          recipe.ingredient_id
        )
        .single()

      if (
        ingredientError
      ) {
        throw ingredientError
      }

      const newStock =
        Number(
          ingredient.stock || 0
        ) - deduction

      await supabaseAdmin
        .from('ingredients')
        .update({
          stock:
            newStock,
        })
        .eq(
          'id',
          ingredient.id
        )

      await supabaseAdmin
        .from(
          'inventory_movements'
        )
        .insert([
          {
            ingredient_id:
              ingredient.id,

            movement_type:
              'POS_DEDUCTION',

            quantity:
              deduction,

            reference_type:
              'ORDER',

            reference_id:
              item.order_id,
          },
        ])

      results.push({
        ingredient_id:
          ingredient.id,

        ingredient:
          ingredient.name,

        deducted:
          deduction,

        remaining:
          newStock,
      })
    }
  }

  return results
}
