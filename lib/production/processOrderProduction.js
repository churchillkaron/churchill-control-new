import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function processOrderProduction({
  order_id,
  tenant_id,
}) {
  if (!order_id) {
    throw new Error('Order ID required')
  }

  if (!tenant_id) {
    throw new Error('Tenant ID required')
  }

  const { data: orderItems, error: orderError } = await supabaseAdmin
    .from('daily_sales_items')
    .select('*')
    .eq('order_id', order_id)
    .eq('tenant_id', tenant_id)

  if (orderError) {
    throw new Error(orderError.message)
  }

  if (!orderItems || orderItems.length === 0) {
    throw new Error('No order items found')
  }

  for (const orderItem of orderItems) {
    const { data: recipeItems, error: recipeError } = await supabaseAdmin
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
      .eq('dish_id', orderItem.dish_id)
      .eq('tenant_id', tenant_id)

    if (recipeError) {
      throw new Error(recipeError.message)
    }

    if (!recipeItems || recipeItems.length === 0) {
      continue
    }

    let totalDishCost = 0

    for (const recipe of recipeItems) {
      const ingredient = recipe.ingredients

      const usageQuantity =
        Number(recipe.quantity || 0) *
        Number(orderItem.quantity || 0)

      const currentStock = Number(ingredient.quantity || 0)

      const newStock = currentStock - usageQuantity

      const ingredientCost =
        Number(ingredient.cost_per_unit || 0) *
        usageQuantity

      totalDishCost += ingredientCost

      const { error: updateIngredientError } = await supabaseAdmin
        .from('ingredients')
        .update({
          quantity: newStock,
        })
        .eq('id', ingredient.id)
        .eq('tenant_id', tenant_id)

      if (updateIngredientError) {
        throw new Error(updateIngredientError.message)
      }

      const { error: movementError } = await supabaseAdmin
        .from('inventory_movements')
        .insert({
          tenant_id,
          ingredient_id: ingredient.id,
          type: 'usage',
          quantity: usageQuantity,
          reference_id: order_id,
          notes: `Production usage for order ${order_id}`,
        })

      if (movementError) {
        console.error(movementError)
      }
    }

    const { error: updateSalesItemError } = await supabaseAdmin
      .from('daily_sales_items')
      .update({
        cost: totalDishCost,
      })
      .eq('id', orderItem.id)

    if (updateSalesItemError) {
      console.error(updateSalesItemError)
    }
  }

  return {
    success: true,
  }
}
