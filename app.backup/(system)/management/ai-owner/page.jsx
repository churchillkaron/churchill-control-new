"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function AIOwnerPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    report,
    setReport,
  ] = useState({

    revenue: 0,

    profit: 0,

    foodCost: 0,

    orders: 0,

    lowStock: 0,

    topDish: '-',

    recommendation: '',
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
        tenantId)

    const {
      data: ingredients,
    } = await supabase
      .from('ingredients')
      .select('*')
      .eq(
        'tenant_id',
        tenantId)

    const rows =
      sales || []

    let revenue = 0
    let cost = 0
    let orders = 0

    const dishMap = {}

    rows.forEach(row => {

      revenue +=
        Number(
          row.revenue || 0)

      cost +=
        Number(
          row.cost || 0)

      orders +=
        Number(
          row.quantity || 0)

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
        row.quantity || 0)
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

    const ranked =
      Object.entries(
        dishMap
      )
        .sort(
          (
            a,
            b
          ) =>
            b[1] - a[1]
        )

    const topDish =
      ranked.length > 0
        ? ranked[0][0]
        : '-'

    const lowStock =
      (ingredients || [])
        .filter(
          i =>
            Number(
              i.quantity || 0
            ) <= 5
        )

    let recommendation =
      'Operations stable.'

    if (
      Number(foodCost) > 40
    ) {

      recommendation =
        'Food cost critical. Increase pricing or reduce recipe cost immediately.'

    } else if (
      lowStock.length >= 5
    ) {

      recommendation =
        'Inventory risk detected. Procurement replenishment required.'

    } else if (
      profit < revenue * 0.4
    ) {

      recommendation =
        'Profit margin below operational target.'
    }

    setReport({

      revenue,

      profit,

      foodCost,

      orders,

      lowStock:
        lowStock.length,

      topDish,

      recommendation,
    })
  }

  return (

    <PageWrapper
      title="AI Owner"
      subtitle="Restaurant executive intelligence"
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
                report.revenue.toFixed(0)
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
                report.profit.toFixed(0)
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Food Cost
            </div>

            <div className={`text-3xl font-light ${
              Number(
                report.foodCost
              ) > 40
                ? 'text-red-400'
                : Number(
                    report.foodCost
                  ) > 30
                ? 'text-yellow-400'
                : 'text-emerald-400'
            }`}>

              {
                report.foodCost
              }%

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Orders
            </div>

            <div className="text-3xl font-light">
              {
                report.orders
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Low Stock
            </div>

            <div className="text-3xl font-light text-red-400">
              {
                report.lowStock
              }
            </div>

          </div>

        </div>

        <div className="grid grid-cols-2 gap-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              Best Seller
            </div>

            <div className="text-5xl font-light text-violet-400">
              {
                report.topDish
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              AI Recommendation
            </div>

            <div className="text-xl leading-relaxed text-zinc-300">
              {
                report.recommendation
              }
            </div>

          </div>

        </div>

      </div>

    </PageWrapper>
  )
}
