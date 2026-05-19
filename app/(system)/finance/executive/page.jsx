'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function ExecutiveFinancePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    stats,
    setStats,
  ] = useState({

    revenue: 0,

    cost: 0,

    profit: 0,

    foodCost: 0,

    orders: 0,

    avgOrder: 0,
  })

  const [
    topDishes,
    setTopDishes,
  ] = useState([])

  const [
    lowStock,
    setLowStock,
  ] = useState([])

  useEffect(() => {

    async function loadTenant() {

      const {
        data: { user },
      } =
        await supabase.auth.getUser()

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
      data: sales,
    } = await supabase
      .from(
        'daily_sales_items'
      )
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )

    const {
      data: ingredients,
    } = await supabase
      .from('ingredients')
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )

    const rows =
      sales || []

    let revenue = 0
    let cost = 0
    let orders = 0

    const dishMap = {}

    rows.forEach(row => {

      revenue +=
        Number(
          row.revenue || 0
        )

      cost +=
        Number(
          row.cost || 0
        )

      orders +=
        Number(
          row.quantity || 0
        )

      if (
        !dishMap[
          row.item_name
        ]
      ) {

        dishMap[
          row.item_name
        ] = 0
      }

      dishMap[
        row.item_name
      ] += Number(
        row.quantity || 0
      )
    })

    const profit =
      revenue - cost

    const foodCost =
      revenue > 0
        ? (
            (cost / revenue) *
            100
          ).toFixed(1)
        : 0

    const avgOrder =
      orders > 0
        ? (
            revenue / orders
          ).toFixed(2)
        : 0

    const ranked =
      Object.entries(
        dishMap
      )
        .map(
          ([name, qty]) => ({
            name,
            qty,
          })
        )
        .sort(
          (
            a,
            b
          ) =>
            b.qty - a.qty
        )
        .slice(0, 5)

    const low =
      (ingredients || [])
        .filter(
          i =>
            Number(
              i.quantity || 0
            ) <= 10
        )
        .sort(
          (
            a,
            b
          ) =>
            Number(
              a.quantity || 0
            ) -
            Number(
              b.quantity || 0
            )
        )

    setTopDishes(
      ranked
    )

    setLowStock(
      low
    )

    setStats({

      revenue,

      cost,

      profit,

      foodCost,

      orders,

      avgOrder,
    })
  }

  return (

    <PageWrapper
      title="Executive Dashboard"
      subtitle="Restaurant operating intelligence"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-6 gap-4 mb-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Revenue
            </div>

            <div className="text-3xl font-light">
              ฿
              {
                stats.revenue.toFixed(0)
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Cost
            </div>

            <div className="text-3xl font-light text-red-400">
              ฿
              {
                stats.cost.toFixed(0)
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Profit
            </div>

            <div className="text-3xl font-light text-emerald-400">
              ฿
              {
                stats.profit.toFixed(0)
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Food Cost
            </div>

            <div className="text-3xl font-light">
              {
                stats.foodCost
              }%
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Orders
            </div>

            <div className="text-3xl font-light">
              {
                stats.orders
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Avg Order
            </div>

            <div className="text-3xl font-light">
              ฿
              {
                stats.avgOrder
              }
            </div>

          </div>

        </div>

        <div className="grid grid-cols-2 gap-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              Top Selling Dishes
            </div>

            <div className="space-y-4">

              {topDishes.map(
                (
                  dish,
                  index
                ) => (

                  <div
                    key={dish.name}
                    className="bg-black border border-zinc-800 rounded-2xl p-4 flex items-center justify-between"
                  >

                    <div className="flex items-center gap-4">

                      <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center">
                        {index + 1}
                      </div>

                      <div>

                        <div className="text-lg">
                          {
                            dish.name
                          }
                        </div>

                        <div className="text-sm text-zinc-500">
                          Best seller
                        </div>

                      </div>

                    </div>

                    <div className="text-2xl font-light">
                      {
                        dish.qty
                      }
                    </div>

                  </div>

                )
              )}

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              Low Stock Alerts
            </div>

            <div className="space-y-4">

              {lowStock.map(
                ingredient => (

                  <div
                    key={ingredient.id}
                    className="bg-black border border-zinc-800 rounded-2xl p-4 flex items-center justify-between"
                  >

                    <div>

                      <div className="text-lg">
                        {
                          ingredient.name
                        }
                      </div>

                      <div className="text-sm text-zinc-500">
                        {
                          ingredient.department
                        }
                      </div>

                    </div>

                    <div className={`text-2xl font-light ${
                      Number(
                        ingredient.quantity || 0
                      ) <= 5
                        ? 'text-red-400'
                        : 'text-yellow-400'
                    }`}>

                      {
                        ingredient.quantity
                      }

                    </div>

                  </div>

                )
              )}

            </div>

          </div>

        </div>

      </div>

    </PageWrapper>
  )
}
