"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function IngredientsPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    ingredients,
    setIngredients,
  ] = useState([])

  const [
    loading,
    setLoading,
  ] = useState(false)

  const [
    form,
    setForm,
  ] = useState({

    name: '',

    quantity: '',

    unit: 'kg',

    cost_per_unit: '',

    department: 'kitchen',
  })

  useEffect(() => {

    async function loadTenant() {

      const {
        data: { user },
      } =
        await supabase.auth.getSession()

      if (!user) return

      const {
        data,
      } = await supabase
        .from(
          'staff_accounts'
        )
        .select('*')
        .eq(
          'auth_user_id',
          user.id
        )
        .single()

      if (
        data?.tenant_id
      ) {

        setTenantId(
          data.tenant_id
        )
      }
    }

    loadTenant()

  }, [])

  useEffect(() => {

    loadIngredients()

  }, [tenantId])

  async function loadIngredients() {

    if (!tenantId) {
      return
    }

    const {
      data,
    } = await supabase
      .from('ingredients')
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )
      .order('name')

    setIngredients(
      data || []
    )
  }

  async function createIngredient() {

    try {

      setLoading(true)

      const {
        error,
      } = await supabase
        .from('ingredients')
        .insert({

          name:
            form.name,

          quantity:
            Number(
              form.quantity || 0
            ),

          unit:
            form.unit,

          cost_per_unit:
            Number(
              form.cost_per_unit || 0
            ),

          department:
            form.department,

          tenant_id:
            tenantId,
        })

      if (error) {

        console.error(
          error
        )

        alert(
          error.message
        )

        return
      }

      setForm({

        name: '',

        quantity: '',

        unit: 'kg',

        cost_per_unit: '',

        department:
          'kitchen',
      })

      await loadIngredients()

    } catch (error) {

      console.error(error)

      alert('Failed')

    } finally {

      setLoading(false)
    }
  }

  async function addStock(
    ingredient
  ) {

    const amount =
      prompt(
        'Add quantity'
      )

    if (!amount) {
      return
    }

    const newQty =
      Number(
        ingredient.quantity || 0
      ) +
      Number(amount)

    await supabase
      .from('ingredients')
      .update({
        quantity:
          newQty,
      })
      .eq(
        'id',
        ingredient.id
      )

    await supabase
      .from(
        'inventory_movements'
      )
      .insert({

        tenant_id:
          tenantId,

        ingredient_id:
          ingredient.id,

        type:
          'restock',

        quantity:
          Number(amount),

        notes:
          'Manual stock replenishment',

        created_at:
          new Date(),
      })

    await loadIngredients()
  }

  return (

    <PageWrapper
      title="Ingredients"
      subtitle="Inventory and production stock management"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-6">

          <div className="text-2xl font-semibold mb-6">
            Add Ingredient
          </div>

          <div className="grid grid-cols-5 gap-4">

            <input
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name:
                    e.target.value,
                })
              }
              placeholder="Ingredient"
              className="bg-black border border-zinc-700 rounded-2xl p-4"
            />

            <input
              type="number"
              value={
                form.quantity
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  quantity:
                    e.target.value,
                })
              }
              placeholder="Quantity"
              className="bg-black border border-zinc-700 rounded-2xl p-4"
            />

            <input
              value={form.unit}
              onChange={(e) =>
                setForm({
                  ...form,
                  unit:
                    e.target.value,
                })
              }
              placeholder="Unit"
              className="bg-black border border-zinc-700 rounded-2xl p-4"
            />

            <input
              type="number"
              value={
                form.cost_per_unit
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  cost_per_unit:
                    e.target.value,
                })
              }
              placeholder="Cost"
              className="bg-black border border-zinc-700 rounded-2xl p-4"
            />

            <select
              value={
                form.department
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  department:
                    e.target.value,
                })
              }
              className="bg-black border border-zinc-700 rounded-2xl p-4"
            >

              <option value="kitchen">
                Kitchen
              </option>

              <option value="bar">
                Bar
              </option>

            </select>

          </div>

          <button
            onClick={
              createIngredient
            }
            disabled={loading}
            className="mt-6 bg-violet-500 px-6 py-4 rounded-2xl"
          >

            {loading
              ? 'Creating...'
              : 'Create Ingredient'}

          </button>

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Ingredient Inventory
          </div>

          <div className="space-y-4">

            {ingredients.map(
              ingredient => (

                <div
                  key={ingredient.id}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 flex items-center justify-between"
                >

                  <div>

                    <div className="text-xl">
                      {
                        ingredient.name
                      }
                    </div>

                    <div className="text-sm text-zinc-500 mt-1">
                      {
                        ingredient.department
                      }
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-3xl font-light">
                      {
                        ingredient.quantity
                      }
                    </div>

                    <div className="text-sm text-zinc-500">
                      {
                        ingredient.unit
                      }
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-lg">
                      ฿
                      {
                        ingredient.cost_per_unit
                      }
                    </div>

                    <button
                      onClick={() =>
                        addStock(
                          ingredient
                        )
                      }
                      className="mt-2 bg-emerald-500 text-black px-4 py-2 rounded-xl text-sm"
                    >
                      Restock
                    </button>

                  </div>

                </div>

              )
            )}

          </div>

        </div>

      </div>

    </PageWrapper>
  )
}
