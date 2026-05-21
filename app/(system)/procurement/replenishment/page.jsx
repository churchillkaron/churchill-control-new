"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function ReplenishmentPage() {

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

    loadData()

  }, [tenantId])

  async function loadData() {

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
      .order(
        'quantity',
        {
          ascending: true,
        }
      )

    setIngredients(
      data || []
    )
  }

  async function createPurchaseRequest(
    ingredient
  ) {

    try {

      setLoading(true)

      const suggestedQty =
        Math.max(
          20 -
          Number(
            ingredient.quantity || 0
          ),
          5
        )

      const estimatedCost =
        suggestedQty *
        Number(
          ingredient.cost_per_unit || 0
        )

      const {
        error,
      } = await supabase
        .from(
          'purchase_requests'
        )
        .insert({

          ingredient_id:
            ingredient.id,

          ingredient_name:
            ingredient.name,

          quantity:
            suggestedQty,

          estimated_cost:
            estimatedCost,

          status:
            'PENDING',

          tenant_id:
            tenantId,

          created_at:
            new Date(),
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

      alert(
        'Purchase Request Created'
      )

    } catch (error) {

      console.error(error)

      alert('Failed')

    } finally {

      setLoading(false)
    }
  }

  const lowStock =
    ingredients.filter(
      i =>
        Number(
          i.quantity || 0
        ) <= 10
    )

  return (

    <PageWrapper
      title="Auto Replenishment"
      subtitle="Procurement intelligence and low stock purchasing"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-3 gap-6">

          {lowStock.map(
            ingredient => {

              const qty =
                Number(
                  ingredient.quantity || 0
                )

              const suggestedQty =
                Math.max(
                  20 - qty,
                  5
                )

              const estimatedCost =
                suggestedQty *
                Number(
                  ingredient.cost_per_unit || 0
                )

              return (

                <div
                  key={ingredient.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"
                >

                  <div className="flex items-start justify-between mb-6">

                    <div>

                      <div className="text-2xl font-semibold">
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

                    <div className={`text-sm font-semibold ${
                      qty <= 5
                        ? 'text-red-400'
                        : 'text-yellow-400'
                    }`}>

                      {qty <= 5
                        ? 'CRITICAL'
                        : 'WARNING'}

                    </div>

                  </div>

                  <div className="space-y-4 mb-6">

                    <div className="flex items-center justify-between">

                      <div className="text-zinc-500">
                        Current Stock
                      </div>

                      <div className="text-2xl font-light">
                        {qty}
                      </div>

                    </div>

                    <div className="flex items-center justify-between">

                      <div className="text-zinc-500">
                        Suggested Order
                      </div>

                      <div className="text-2xl font-light text-emerald-400">
                        {suggestedQty}
                      </div>

                    </div>

                    <div className="flex items-center justify-between">

                      <div className="text-zinc-500">
                        Estimated Cost
                      </div>

                      <div className="text-xl">
                        ฿
                        {estimatedCost.toFixed(2)}
                      </div>

                    </div>

                  </div>

                  <button
                    onClick={() =>
                      createPurchaseRequest(
                        ingredient
                      )
                    }
                    disabled={loading}
                    className="w-full bg-violet-500 hover:bg-violet-400 transition-all rounded-2xl py-4"
                  >

                    Create Purchase Request

                  </button>

                </div>

              )
            }
          )}

        </div>

      </div>

    </PageWrapper>
  )
}
