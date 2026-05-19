import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function logWaste({
  ingredient_id,
  quantity,
  reason,
  created_by,
}) {

  const {
    data: ingredient,
    error:
      ingredientError,
  } = await supabaseAdmin
    .from('ingredients')
    .select('*')
    .eq(
      'id',
      ingredient_id
    )
    .single()

  if (ingredientError) {
    throw ingredientError
  }

  const newStock =
    Number(
      ingredient.stock || 0
    ) - Number(quantity)

  await supabaseAdmin
    .from('ingredients')
    .update({
      stock:
        newStock,
    })
    .eq(
      'id',
      ingredient_id
    )

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'production_waste_logs'
    )
    .insert([
      {
        ingredient_id,
        quantity,
        reason,
        created_by,
        estimated_cost:
          Number(quantity) *
          Number(
            ingredient.cost_per_unit || 0
          ),
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  await supabaseAdmin
    .from(
      'inventory_movements'
    )
    .insert([
      {
        ingredient_id,
        movement_type:
          'WASTE',

        quantity,

        reference_type:
          'WASTE_LOG',

        reference_id:
          data.id,
      },
    ])

  return data
}
