import { supabaseAdmin } from '@/lib/shared/supabase/admin'
import { createCogsEntry } from '@/lib/finance/createCogsEntry'

export async function processOrderProduction({
  order_id,
  tenant_id,
}) {

  if (!order_id) throw new Error('Order ID required')
  if (!tenant_id) throw new Error('Tenant ID required')

  // LOAD ORDER
  const { data: orders, error: orderLoadError } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', order_id)
    .eq('tenant_id', tenant_id)

  if (orderLoadError) throw new Error(orderLoadError.message)
  const order = orders?.[0]
  if (!order) throw new Error("Order not found")

  if (order.production_processed === true) {
    return { success: true, skipped: true, reason: 'Production already processed' }
  }
  if (!['CLOSED','COMPLETED'].includes(order.status)) {
    return { success: false, error: 'Order not completed' }
  }
  if (order.payment_status !== 'PAID') {
    return { success: false, error: 'Order not paid' }
  }

  // LOAD ORDER ITEMS
  const { data: orderItems, error: orderError } = await supabaseAdmin
    .from("order_items")
    .select('*')
    .eq('order_id', order_id)
    .eq('tenant_id', tenant_id)

  if (orderError) throw new Error(orderError.message)
  if (!orderItems || orderItems.length === 0) {
    return { success: false, error: 'No order items found' }
  }

  for (const orderItem of orderItems) {
    const { data: dishes, error: dishError } = await supabaseAdmin
      .from('dishes')
      .select(`id, name, production_type`)
      .eq('id', orderItem.dish_id)
      .eq('tenant_id', tenant_id)

    if (dishError) throw new Error(dishError.message)
    const dish = dishes?.[0]
    if (!dish) throw new Error("Dish not found")

    const productionType = dish?.production_type || 'RAW'
    const useBatch = productionType === 'BATCH' || productionType === 'HYBRID'

    console.log('[PRODUCTION_TYPE]', { dishId: orderItem.dish_id, dishName: dish?.name, productionType, useBatch })

    const { data: recipeItems, error: recipeError } = await supabaseAdmin
      .from('recipe_items')
      .select(`*, ingredients (id, name, quantity, cost_per_base_unit)`)
      .eq('dish_id', orderItem.dish_id)
      .eq('tenant_id', tenant_id)

    if (recipeError) throw new Error(recipeError.message)

    console.log('[RECIPE_ITEMS]', JSON.stringify(recipeItems, null, 2))

    if (!recipeItems || recipeItems.length === 0) {
      console.warn('NO_RECIPE_ITEMS_FOUND_COGS_ONLY', { dishId: orderItem.dish_id, itemName: orderItem.item_name })
      await createCogsEntry({
        tenantId: tenant_id,
        orderId: order_id,
        dishId: orderItem.dish_id,
        quantity: Number(orderItem.quantity || 0),
        revenueAmount: Number(orderItem.price || 0) * Number(orderItem.quantity || 0),
        createdBy: 'system',
        useBatch,
      })
      continue
    }

    let totalDishCost = 0

    if (productionType === 'RAW' || productionType === 'HYBRID') {
      for (const recipe of recipeItems) {
        const ingredient = recipe.ingredients
        if (!ingredient) continue

        const usageQuantity = Number(recipe.quantity || 0) * Number(orderItem.quantity || 0)
        const currentStock = Number(ingredient.quantity || 0)
        const newStock = currentStock - usageQuantity
        const ingredientCost = Number(ingredient.cost_per_base_unit || 0) * usageQuantity

        totalDishCost += ingredientCost

        const { error: updateIngredientError } = await supabaseAdmin
          .from('ingredients')
          .update({ quantity: newStock })
          .eq('id', ingredient.id)
          .eq('tenant_id', tenant_id)

        if (updateIngredientError) throw new Error(updateIngredientError.message)

        await supabaseAdmin
          .from('inventory_movements')
          .insert({
            tenant_id,
            ingredient_id: ingredient.id,
            type: 'usage',
            quantity: usageQuantity,
            reference_id: order_id,
            notes: `Production deduction for order ${order_id}`,
            created_at: new Date(),
          })
      }
    }

    await createCogsEntry({
      tenantId: tenant_id,
      orderId: order_id,
      dishId: orderItem.dish_id,
      quantity: Number(orderItem.quantity || 0),
      revenueAmount: Number(orderItem.price || 0) * Number(orderItem.quantity || 0),
      createdBy: 'system',
      useBatch,
    })
  }

  await supabaseAdmin
    .from('orders')
    .update({
      production_processed: true,
      production_processed_at: new Date().toISOString(),
    })
    .eq('id', order_id)
    .eq('tenant_id', tenant_id)
}
