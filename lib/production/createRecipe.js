import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createRecipe({
  dish_id,
  items,
  tenant_id,
}) {
  if (!dish_id) {
    throw new Error('Dish ID is required')
  }

  if (!tenant_id) {
    throw new Error('Tenant ID is required')
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Recipe items are required')
  }

  const { data: dish, error: dishError } = await supabaseAdmin
    .from('dishes')
    .select('*')
    .eq('id', dish_id)
    .eq('tenant_id', tenant_id)
    .single()

  if (dishError || !dish) {
    throw new Error('Dish not found')
  }

  const ingredientIds = items.map(i => i.ingredient_id)

  const { data: ingredients, error: ingredientsError } = await supabaseAdmin
    .from('ingredients')
    .select('*')
    .in('id', ingredientIds)
    .eq('tenant_id', tenant_id)

  if (ingredientsError) {
    throw new Error(ingredientsError.message)
  }

  if (!ingredients || ingredients.length !== ingredientIds.length) {
    throw new Error('Some ingredients not found')
  }

  const { error: deleteError } = await supabaseAdmin
    .from('recipe_items')
    .delete()
    .eq('dish_id', dish_id)
    .eq('tenant_id', tenant_id)

  if (deleteError) {
    throw new Error(deleteError.message)
  }

  const recipeRows = items.map(item => ({
    dish_id,
    ingredient_id: item.ingredient_id,
    quantity: Number(item.quantity),
    tenant_id,
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
      ing => ing.id === item.ingredient_id
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
    .eq('tenant_id', tenant_id)

  if (updateDishError) {
    throw new Error(updateDishError.message)
  }

  return {
    success: true,
    dish_id,
    total_cost: totalCost,
  }
}
