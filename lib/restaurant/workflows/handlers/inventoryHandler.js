import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function inventoryHandler(payload) {
  const { tenantId, orderId, items = [] } = payload

  if (!tenantId || !orderId) {
    throw new Error('inventoryHandler requires tenantId and orderId')
  }

  const movements = []
  let totalCost = 0

  for (const item of items) {
    const dishId = item.dish_id || item.dishId || item.dish
    const quantity = Number(item.quantity || 1)

    if (!dishId) continue

    const { data: recipeItems, error: recipeError } = await supabase
      .from('recipe_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('dish_id', dishId)

    if (recipeError) {
      throw new Error(recipeError.message)
    }

    for (const recipeItem of recipeItems || []) {
      const ingredientId = recipeItem.ingredient_id
      const usedQuantity = Number(recipeItem.quantity || 0) * quantity

      if (!ingredientId || usedQuantity <= 0) continue

      const { data: ingredient, error: ingredientError } = await supabase
        .from('ingredients')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', ingredientId)
        .single()

      if (ingredientError || !ingredient) {
        throw new Error(`Ingredient not found: ${ingredientId}`)
      }

      const currentQuantity = Number(ingredient.quantity || 0)
      const unitCost = Number(ingredient.unit_cost || ingredient.cost || 0)
      const newQuantity = currentQuantity - usedQuantity
      const movementCost = usedQuantity * unitCost

      totalCost += movementCost

      const { error: updateError } = await supabase
        .from('ingredients')
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('id', ingredientId)

      if (updateError) {
        throw new Error(updateError.message)
      }

      const movement = {
        tenant_id: tenantId,
        order_id: orderId,
        dish_id: dishId,
        ingredient_id: ingredientId,
        movement_type: 'ORDER_COMPLETED',
        quantity: usedQuantity * -1,
        unit_cost: unitCost,
        total_cost: movementCost,
        created_at: new Date().toISOString(),
      }

      await supabase
        .from('inventory_movements')
        .insert(movement)

      movements.push(movement)
    }
  }

  return {
    success: true,
    totalCost,
    movements,
  }
}
