"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function PerformancePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    performance,
    setPerformance,
  ] = useState({

    revenue: 0,

    foodCost: 0,

    orders: 0,

    avgOrder: 0,

    kitchenLevel: 'GOOD',

    financeLevel: 'GOOD',

    inventoryLevel: 'GOOD',

    overall: 'GOOD',
  })

  const [
    alerts,
    setAlerts,
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
    })

    const foodCost =
      revenue > 0
        ? (
            (cost / revenue) *
            100
          )
        : 0

    const avgOrder =
      orders > 0
        ? (
            revenue / orders
          )
        : 0

    let financeLevel =
      'GOOD'

    if (foodCost > 40) {

      financeLevel =
        'CRITICAL'

    } else if (
      foodCost > 30
    ) {

      financeLevel =
        'WARNING'
    }

    const lowStock =
      (ingredients || [])
        .filter(
          i =>
            Number(
              i.quantity || 0
            ) <= 5
        )

    let inventoryLevel =
      'GOOD'

    if (
      lowStock.length >= 5
    ) {

      inventoryLevel =
        'CRITICAL'

    } else if (
      lowStock.length >= 2
    ) {

      inventoryLevel =
        'WARNING'
    }

    let kitchenLevel =
      'GOOD'

    if (
      orders > 200
    ) {

      kitchenLevel =
        'WARNING'
    }

    const levels = [
      financeLevel,
      inventoryLevel,
      kitchenLevel,
    ]

    let overall =
      'GOOD'

    if (
      levels.includes(
        'CRITICAL'
      )
    ) {

      overall =
        'CRITICAL'

    } else if (
      levels.includes(
        'WARNING'
      )
    ) {

      overall =
        'WARNING'
    }

    const generatedAlerts =
      []

    if (
      foodCost > 40
    ) {

      generatedAlerts.push({
        type:
          'FINANCE',
        level:
          'CRITICAL',
        message:
          'Food cost above operational threshold',
      })
    }

    lowStock.forEach(
      ingredient => {

        generatedAlerts.push({

          type:
            'INVENTORY',

          level:
            'WARNING',

          message:
            `${ingredient.name} low stock`,
        })
      }
    )

    setAlerts(
      generatedAlerts
    )

    setPerformance({

      revenue,

      foodCost:
        foodCost.toFixed(1),

      orders,

      avgOrder:
        avgOrder.toFixed(2),

      kitchenLevel,

      financeLevel,

      inventoryLevel,

      overall,
    })
  }

  function getColor(
    level
  ) {

    if (
      level ===
      'CRITICAL'
    ) {

      return 'text-red-400'
    }

    if (
      level ===
      'WARNING'
    ) {

      return 'text-yellow-400'
    }

    return 'text-emerald-400'
  }

  return (

    <PageWrapper
      title="Operational Performance"
      subtitle="AI operational intelligence and management monitoring"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-5 gap-4 mb-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Revenue
            </div>

            <div className="text-3xl font-light">
              ฿
              {
                performance.revenue.toFixed(0)
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Food Cost
            </div>

            <div className={`text-3xl font-light ${
              getColor(
                performance.financeLevel
              )
            }`}>

              {
                performance.foodCost
              }%

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Orders
            </div>

            <div className="text-3xl font-light">
              {
                performance.orders
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
                performance.avgOrder
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Overall
            </div>

            <div className={`text-3xl font-light ${
              getColor(
                performance.overall
              )
            }`}>

              {
                performance.overall
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-3 gap-6 mb-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-xl font-semibold mb-4">
              Finance
            </div>

            <div className={`text-5xl font-light ${
              getColor(
                performance.financeLevel
              )
            }`}>

              {
                performance.financeLevel
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-xl font-semibold mb-4">
              Inventory
            </div>

            <div className={`text-5xl font-light ${
              getColor(
                performance.inventoryLevel
              )
            }`}>

              {
                performance.inventoryLevel
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-xl font-semibold mb-4">
              Kitchen
            </div>

            <div className={`text-5xl font-light ${
              getColor(
                performance.kitchenLevel
              )
            }`}>

              {
                performance.kitchenLevel
              }

            </div>

          </div>

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Operational Alerts
          </div>

          <div className="space-y-4">

            {alerts.map(
              (
                alert,
                index
              ) => (

                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 flex items-center justify-between"
                >

                  <div>

                    <div className="text-xl">
                      {
                        alert.message
                      }
                    </div>

                    <div className="text-sm text-zinc-500 mt-1">
                      {
                        alert.type
                      }
                    </div>

                  </div>

                  <div className={`text-sm font-semibold ${
                    getColor(
                      alert.level
                    )
                  }`}>

                    {
                      alert.level
                    }

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
