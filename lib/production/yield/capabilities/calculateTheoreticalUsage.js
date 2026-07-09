import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function calculateTheoreticalUsage({
  order_items = [],
}) {

  const usageMap = {}

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
          unit
        )
      `)
      .eq(
        'dish_id',
        item.dish_id
      )

    if (error) {
      throw error
    }

    for (const recipe of recipeItems) {

      const itemId =
        recipe.item_id

      const usage =
        Number(
          recipe.quantity || 0
        ) *
        Number(
          item.quantity || 1
        )

      if (
        !usageMap[
          itemId
        ]
      ) {

        usageMap[
          itemId
        ] = {
          item_id:
            itemId,

          ingredient:
            recipe
              .ingredients
              ?.name,

          unit:
            recipe
              .ingredients
              ?.unit,

          theoretical_usage: 0,
        }
      }

      usageMap[
        itemId
      ].theoretical_usage +=
        usage
    }
  }

  return Object.values(
    usageMap
  )
}
