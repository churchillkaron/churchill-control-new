'use client'

import { useEffect, useState } from 'react'
import PageWrapper from '@/components/PageWrapper'
import { supabase } from '@/lib/shared/supabase/client'
import { getIntelligenceLayer } from '../layers'

export default function IntelligenceLayerPage({ params }) {
  const layer = getIntelligenceLayer(params.layer)

  const [tenantId, setTenantId] = useState(null)

  const [data, setData] = useState({
    revenue: 0,
    cost: 0,
    foodCost: 0,
    orders: 0,
    activeTables: 0,
    lowStock: 0,
    kitchenTickets: 0,
    score: layer.base,
    state: 'LOADING',
    alerts: [],
  })

  useEffect(() => {
    loadTenant()
  }, [])

  useEffect(() => {
    if (tenantId) loadData()
  }, [tenantId])

  async function loadTenant() {
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user

    if (!user) return

    const { data: staff } = await supabase
      .from('staff_accounts')
      .select('tenant_id')
      .eq('auth_user_id', user.id)
      .single()

    if (staff?.tenant_id) {
      setTenantId(staff.tenant_id)
    }
  }

  async function loadData() {
    const [{ data: sales }, { data: ingredients }, { data: kitchen }, { data: tables }] =
      await Promise.all([
        supabase.from('daily_sales_items').select('*').eq('tenant_id', tenantId),
        supabase.from('ingredients').select('*').eq('tenant_id', tenantId),
        supabase.from('kitchen_tickets').select('*').eq('tenant_id', tenantId),
        supabase.from('table_sessions').select('*').eq('tenant_id', tenantId),
      ])

    const revenue = (sales || []).reduce(
      (sum, row) => sum + Number(row.revenue || row.price || 0) * Number(row.quantity || 1),
      0
    )

    const cost = (sales || []).reduce(
      (sum, row) => sum + Number(row.cost || 0),
      0
    )

    const foodCost = revenue > 0 ? (cost / revenue) * 100 : 0

    const activeTables = (tables || []).filter(
      table => table.status === 'ACTIVE'
    ).length

    const lowStock = (ingredients || []).filter(
      item => Number(item.quantity || 0) <= 5
    ).length

    const kitchenTickets = (kitchen || []).length
    const orders = (sales || []).length

    const alerts = []

    let score = layer.base

    if (revenue > 0) score += 10
    if (foodCost > 0 && foodCost <= 30) score += 15
    if (activeTables > 0) score += 5
    if (orders > 10) score += 10

    if (foodCost > 35) {
      score -= 15
      alerts.push('Food cost is too high')
    }

    if (lowStock > 0) {
      score -= 10
      alerts.push(`${lowStock} ingredients are low stock`)
    }

    if (kitchenTickets > 20) {
      score -= 10
      alerts.push('Kitchen ticket load is high')
    }

    let state = 'GOOD'

    if (score >= layer.base + 30) state = 'EXCELLENT'
    if (score < layer.base) state = 'WARNING'
    if (score < layer.base - 20) state = 'CRITICAL'

    setData({
      revenue,
      cost,
      foodCost,
      orders,
      activeTables,
      lowStock,
      kitchenTickets,
      score: Math.round(score),
      state,
      alerts,
    })
  }

  function statusColor(state) {
    if (state === 'EXCELLENT') return 'text-emerald-400'
    if (state === 'GOOD') return 'text-blue-400'
    if (state === 'WARNING') return 'text-yellow-400'
    return 'text-red-400'
  }

  return (
    <PageWrapper title={layer.title} subtitle={layer.subtitle}>
      <div className="p-6 text-white space-y-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
          <div className="flex items-center justify-between gap-6">
            <div>
              <div className="text-sm text-zinc-500 mb-2">
                System State
              </div>

              <div className={`text-5xl font-light ${statusColor(data.state)}`}>
                {data.state}
              </div>
            </div>

            <div className={`text-7xl font-light ${statusColor(data.state)}`}>
              {data.score}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <Metric label="Revenue" value={`${data.revenue.toLocaleString()} ฿`} />
          <Metric label="Cost" value={`${data.cost.toLocaleString()} ฿`} />
          <Metric label="Food Cost" value={`${data.foodCost.toFixed(1)}%`} />
          <Metric label="Orders" value={data.orders} />
          <Metric label="Active Tables" value={data.activeTables} />
          <Metric label="Low Stock" value={data.lowStock} />
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="text-2xl font-semibold mb-4">
            Intelligence Alerts
          </div>

          {data.alerts.length === 0 ? (
            <div className="text-zinc-400">
              No critical alerts. System is stable.
            </div>
          ) : (
            <div className="space-y-3">
              {data.alerts.map((alert, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-zinc-800 bg-black p-4 text-yellow-300"
                >
                  {alert}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="text-sm text-zinc-500 mb-2">
        {label}
      </div>

      <div className="text-3xl font-light">
        {value}
      </div>
    </div>
  )
}
