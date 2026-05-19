'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function CommandCenterPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    system,
    setSystem,
  ] = useState({

    revenue: 0,

    profit: 0,

    foodCost: 0,

    activeTables: 0,

    kitchenPending: 0,

    lowStock: 0,

    alerts: [],
  })

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

    if (!tenantId) {
      return
    }

    loadData()

    const interval =
      setInterval(
        loadData,
        5000
      )

    return () =>
      clearInterval(
        interval
      )

  }, [tenantId])

  async function loadData() {

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
      data: tables,
    } = await supabase
      .from(
        'table_sessions'
      )
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )
      .eq(
        'status',
        'ACTIVE'
      )

    const {
      data: kitchen,
    } = await supabase
      .from(
        'kitchen_tickets'
      )
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )
      .neq(
        'status',
        'COMPLETED'
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

    let revenue = 0
    let cost = 0

    ;(sales || []).forEach(
      row => {

        revenue +=
          Number(
            row.revenue || 0
          )

        cost +=
          Number(
            row.cost || 0
          )
      }
    )

    const profit =
      revenue - cost

    const foodCost =
      revenue > 0
        ? (
            (cost / revenue) *
            100
          ).toFixed(1)
        : 0

    const lowStock =
      (ingredients || [])
        .filter(
          i =>
            Number(
              i.quantity || 0
            ) <= 5
        )

    const alerts =
      []

    if (
      Number(foodCost) > 40
    ) {

      alerts.push({
        level:
          'CRITICAL',
        text:
          'Food cost above target',
      })
    }

    if (
      lowStock.length > 0
    ) {

      alerts.push({
        level:
          'WARNING',
        text:
          `${lowStock.length} low stock ingredients`,
      })
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      alerts.push({
        level:
          'WARNING',
        text:
          'Kitchen queue overloaded',
      })
    }

    setSystem({

      revenue,

      profit,

      foodCost,

      activeTables:
        (tables || [])
          .length,

      kitchenPending:
        (kitchen || [])
          .length,

      lowStock:
        lowStock.length,

      alerts,
    })
  }

  function levelColor(
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
      title="Command Center"
      subtitle="AI restaurant operating system"
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
                system.revenue.toFixed(0)
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
                system.profit.toFixed(0)
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Food Cost
            </div>

            <div className={`text-3xl font-light ${
              Number(
                system.foodCost
              ) > 40
                ? 'text-red-400'
                : Number(
                    system.foodCost
                  ) > 30
                ? 'text-yellow-400'
                : 'text-emerald-400'
            }`}>

              {
                system.foodCost
              }%

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Active Tables
            </div>

            <div className="text-3xl font-light">
              {
                system.activeTables
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Kitchen Queue
            </div>

            <div className="text-3xl font-light text-yellow-400">
              {
                system.kitchenPending
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Low Stock
            </div>

            <div className="text-3xl font-light text-red-400">
              {
                system.lowStock
              }
            </div>

          </div>

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Live Operational Alerts
          </div>

          <div className="space-y-4">

            {system.alerts.map(
              (
                alert,
                index
              ) => (

                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 flex items-center justify-between"
                >

                  <div className="text-lg">
                    {
                      alert.text
                    }
                  </div>

                  <div className={`text-sm font-semibold ${
                    levelColor(
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

            {system.alerts
              .length === 0 && (

              <div className="bg-black border border-zinc-800 rounded-2xl p-6 text-center text-emerald-400">
                All systems operational
              </div>

            )}

          </div>

        </div>

      </div>

    </PageWrapper>
  )
}
