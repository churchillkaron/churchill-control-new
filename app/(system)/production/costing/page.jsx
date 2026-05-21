"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function ProductionCostingPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    dishes,
    setDishes,
  ] = useState([])

  const [
    recipes,
    setRecipes,
  ] = useState([])

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
      data: dishesData,
    } = await supabase
      .from('dishes')
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )
      .order('name')

    const response =
      await fetch(
        '/api/production/recipes/get',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            tenant_id:
              tenantId,
          }),
        }
      )

    const result =
      await response.json()

    setDishes(
      dishesData || []
    )

    setRecipes(
      result.data || []
    )
  }

  function getMargin(
    price,
    cost
  ) {

    if (!price) {
      return 0
    }

    return (
      (
        (
          Number(price || 0) -
          Number(cost || 0)
        ) /
        Number(price || 0)
      ) * 100
    ).toFixed(1)
  }

  return (

    <PageWrapper
      title="Production Costing"
      subtitle="Dish profitability and production margin"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-3 gap-6">

          {recipes.map(
            dish => {

              const margin =
                getMargin(
                  dish.price,
                  dish.cost
                )

              let color =
                'text-emerald-400'

              if (
                Number(margin) < 40
              ) {

                color =
                  'text-red-400'

              } else if (
                Number(margin) < 60
              ) {

                color =
                  'text-yellow-400'
              }

              return (

                <div
                  key={dish.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"
                >

                  <div className="flex items-start justify-between mb-6">

                    <div>

                      <div className="text-2xl font-semibold">
                        {dish.name}
                      </div>

                      <div className="text-sm text-zinc-500 mt-1">
                        {dish.category}
                      </div>

                    </div>

                    <div className={`text-lg font-semibold ${color}`}>
                      {margin}%
                    </div>

                  </div>

                  <div className="space-y-3 mb-6">

                    <div className="flex items-center justify-between">

                      <div className="text-zinc-500">
                        Selling Price
                      </div>

                      <div className="text-xl">
                        ฿
                        {dish.price || 0}
                      </div>

                    </div>

                    <div className="flex items-center justify-between">

                      <div className="text-zinc-500">
                        Production Cost
                      </div>

                      <div className="text-xl text-red-400">
                        ฿
                        {dish.cost || 0}
                      </div>

                    </div>

                    <div className="flex items-center justify-between">

                      <div className="text-zinc-500">
                        Gross Profit
                      </div>

                      <div className="text-xl text-emerald-400">
                        ฿
                        {(
                          Number(
                            dish.price || 0
                          ) -
                          Number(
                            dish.cost || 0
                          )
                        ).toFixed(2)}
                      </div>

                    </div>

                  </div>

                  <div className="border-t border-zinc-800 pt-4">

                    <div className="text-sm text-zinc-500 mb-3">
                      Recipe Components
                    </div>

                    <div className="space-y-2">

                      {dish.recipe_items?.map(
                        recipe => (

                          <div
                            key={recipe.id}
                            className="flex items-center justify-between text-sm"
                          >

                            <div>
                              {
                                recipe.ingredients?.name
                              }
                            </div>

                            <div className="text-zinc-500">
                              {
                                recipe.quantity
                              }
                              {' '}
                              {
                                recipe.ingredients?.unit
                              }
                            </div>

                          </div>

                        )
                      )}

                    </div>

                  </div>

                </div>

              )
            }
          )}

        </div>

      </div>

    </PageWrapper>
  )
}
