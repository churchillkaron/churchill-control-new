import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function processOrderProduction({
  order_id,
  tenant_id,
}) {

  if (!order_id) {
    throw new Error(
      'Order ID required'
    )
  }

  if (!tenant_id) {
    throw new Error(
      'Tenant ID required'
    )
  }

  const {
    data: orderItems,
    error: orderError,
  } = await supabaseAdmin
    .from('daily_sales_items')
    .select('*')
    .eq(
      'order_id',
      order_id
    )
    .eq(
      'tenant_id',
      tenant_id
    )

  if (orderError) {

    console.error(
      'DAILY SALES ERROR',
      orderError
    )

    throw new Error(
      orderError.message
    )
  }

  if (
    !orderItems ||
    orderItems.length === 0
  ) {

    console.error(
      'NO DAILY SALES ITEMS FOUND'
    )

    return {
      success: false,
      error:
        'No daily sales items found',
    }
  }

  for (const orderItem of orderItems) {

    const {
      data: recipeItems,
      error: recipeError,
    } = await supabaseAdmin
      .from('recipe_items')
      .select(`
        *,
        ingredients (
          id,
          name,
          quantity,
          cost_per_unit
        )
      `)
      .eq(
        'dish_id',
        orderItem.dish_id
      )
      .eq(
        'tenant_id',
        tenant_id
      )

    if (recipeError) {

      console.error(
        'RECIPE ERROR',
        recipeError
      )

      throw new Error(
        recipeError.message
      )
    }

    if (
      !recipeItems ||
      recipeItems.length === 0
    ) {

      console.error(
        'NO RECIPE ITEMS FOR DISH',
        orderItem.dish_id
      )

      continue
    }

    let totalDishCost = 0

    for (const recipe of recipeItems) {

      const ingredient =
        recipe.ingredients

      if (!ingredient) {
        continue
      }

      const usageQuantity =
        Number(
          recipe.quantity || 0
        ) *
        Number(
          orderItem.quantity || 0
        )

      const currentStock =
        Number(
          ingredient.quantity || 0
        )

      const newStock =
        currentStock -
        usageQuantity

      const ingredientCost =
        Number(
          ingredient.cost_per_unit || 0
        ) *
        usageQuantity

      totalDishCost +=
        ingredientCost

      const {
        error:
          updateIngredientError,
      } = await supabaseAdmin
        .from('ingredients')
        .update({
          quantity:
            newStock,
        })
        .eq(
          'id',
          ingredient.id
        )
        .eq(
          'tenant_id',
          tenant_id
        )

      if (
        updateIngredientError
      ) {

        console.error(
          'UPDATE INGREDIENT ERROR',
          updateIngredientError
        )

        throw new Error(
          updateIngredientError.message
        )
      }

      const {
        error:
          movementError,
      } = await supabaseAdmin
        .from(
          'inventory_movements'
        )
        .insert({

          tenant_id,

          ingredient_id:
            ingredient.id,

          type:
            'usage',

          quantity:
            usageQuantity,

          reference_id:
            order_id,

          notes:
            `Production deduction for order ${order_id}`,

          created_at:
            new Date(),
        })

      if (movementError) {

        console.error(
          'MOVEMENT ERROR',
          movementError
        )
      }
    }

    const {
      error:
        updateSalesItemError,
    } = await supabaseAdmin
      .from(
        'daily_sales_items'
      )
      .update({
        cost:
          totalDishCost,

        revenue:
          Number(
            orderItem.price || 0
          ) *
          Number(
            orderItem.quantity || 0
          ),
      })
      .eq(
        'id',
        orderItem.id
      )

    if (
      updateSalesItemError
    ) {

      console.error(
        'UPDATE SALES ITEM ERROR',
        updateSalesItemError
      )
    }
  }

  return {
    success: true,
  }
}
