import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createRecipe({
  dish_id,
  items,
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
}) {
  const resolvedOrganizationId =
    organization_id || organizationId

  const resolvedEntityId =
    entity_id || entityId || null

  if (!dish_id) {
    throw new Error('Dish ID is required')
  }

  if (!resolvedOrganizationId) {
    throw new Error('Organization ID is required')
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Recipe items are required')
  }

  const { data: dish, error: dishError } = await supabaseAdmin
    .from('dishes')
    .select('*')
    .eq('id', dish_id)
    .eq('organization_id', resolvedOrganizationId)
    .single()

  if (dishError || !dish) {
    throw new Error('Dish not found')
  }

  const itemIds = items.map(i => i.item_id)

  const { data: ingredients, error: ingredientsError } = await supabaseAdmin
    .from('inventory_items')
    .select('*')
    .in('id', itemIds)
    .eq('organization_id', resolvedOrganizationId)

  if (ingredientsError) {
    throw new Error(ingredientsError.message)
  }

  if (!ingredients || ingredients.length !== itemIds.length) {
    throw new Error('Some ingredients not found')
  }

  const { error: deleteError } = await supabaseAdmin
    .from('recipe_items')
    .delete()
    .eq('dish_id', dish_id)
    .eq('organization_id', resolvedOrganizationId)

  if (deleteError) {
    throw new Error(deleteError.message)
  }

  const recipeRows = items.map(item => ({
    dish_id,
    item_id: item.item_id,
    quantity: Number(item.quantity),
    organization_id: resolvedOrganizationId,
    entity_id: resolvedEntityId,
  }))

  const { error: insertError } = await supabaseAdmin
    .from('recipe_items')
    .insert(recipeRows)

  if (insertError) {
    throw new Error(insertError.message)
  }

  let totalCost = 0

  for (const item of items) {
    const ingredient = ingredients.find(
      ing => ing.id === item.item_id
    )

    const ingredientCost =
      Number(ingredient.cost_per_unit || 0) *
      Number(item.quantity || 0)

    totalCost += ingredientCost
  }

  const { error: updateDishError } = await supabaseAdmin
    .from('dishes')
    .update({
      cost: totalCost,
    })
    .eq('id', dish_id)
    .eq('organization_id', resolvedOrganizationId)

  if (updateDishError) {
    throw new Error(updateDishError.message)
  }

  return {
    success: true,
    dish_id,
    total_cost: totalCost,
  }
}
