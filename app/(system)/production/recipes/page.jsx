'use client'

import { useEffect, useState } from 'react'
import { useTenant } from '@/app/providers/TenantProvider'
import { supabase } from '@/lib/shared/supabase/client'

export default function RecipesPage() {
  const { tenantId } = useTenant()

  const [dishes, setDishes] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [selectedDish, setSelectedDish] = useState('')
  const [recipeItems, setRecipeItems] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [tenantId])

  async function loadData() {
    if (!tenantId) return

    const { data: dishesData } = await supabase
      .from('dishes')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name')

    const { data: ingredientsData } = await supabase
      .from('ingredients')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name')

    setDishes(dishesData || [])
    setIngredients(ingredientsData || [])
  }

  function addIngredientRow() {
    setRecipeItems([
      ...recipeItems,
      {
        ingredient_id: '',
        quantity: 1,
      },
    ])
  }

  function updateItem(index, field, value) {
    const updated = [...recipeItems]

    updated[index][field] = value

    setRecipeItems(updated)
  }

  async function saveRecipe() {
    try {
      setLoading(true)

      const response = await fetch('/api/production/recipes/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dish_id: selectedDish,
          tenant_id: tenantId,
          items: recipeItems,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        alert(result.error)
        return
      }

      alert('Recipe Saved')
      setRecipeItems([])
    } catch (error) {
      console.error(error)
      alert('Failed')
    } finally {
      setLoading(false)
    }
  }

  const selectedDishData = dishes.find(d => d.id === selectedDish)

  return (
    <div className="p-8 text-white">
      <h1 className="text-3xl font-bold mb-6">
        Production Recipes
      </h1>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
        <label className="block mb-2 text-sm text-zinc-400">
          Select Dish
        </label>

        <select
          value={selectedDish}
          onChange={(e) => setSelectedDish(e.target.value)}
          className="w-full bg-black border border-zinc-700 rounded-xl p-3"
        >
          <option value="">Select Dish</option>

          {dishes.map(dish => (
            <option key={dish.id} value={dish.id}>
              {dish.name}
            </option>
          ))}
        </select>

        {selectedDishData && (
          <div className="mt-4 text-sm text-zinc-400">
            Price: ฿{selectedDishData.price || 0}
          </div>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">
            Recipe Items
          </h2>

          <button
            onClick={addIngredientRow}
            className="bg-white text-black px-4 py-2 rounded-xl"
          >
            Add Ingredient
          </button>
        </div>

        <div className="space-y-4">
          {recipeItems.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-2 gap-4"
            >
              <select
                value={item.ingredient_id}
                onChange={(e) =>
                  updateItem(
                    index,
                    'ingredient_id',
                    e.target.value
                  )
                }
                className="bg-black border border-zinc-700 rounded-xl p-3"
              >
                <option value="">
                  Select Ingredient
                </option>

                {ingredients.map(ingredient => (
                  <option
                    key={ingredient.id}
                    value={ingredient.id}
                  >
                    {ingredient.name}
                  </option>
                ))}
              </select>

              <input
                type="number"
                value={item.quantity}
                onChange={(e) =>
                  updateItem(
                    index,
                    'quantity',
                    e.target.value
                  )
                }
                className="bg-black border border-zinc-700 rounded-xl p-3"
                placeholder="Quantity"
              />
            </div>
          ))}
        </div>

        <button
          onClick={saveRecipe}
          disabled={loading}
          className="mt-6 bg-green-500 text-black px-6 py-3 rounded-xl font-bold"
        >
          {loading ? 'Saving...' : 'Save Recipe'}
        </button>
      </div>
    </div>
  )
}
