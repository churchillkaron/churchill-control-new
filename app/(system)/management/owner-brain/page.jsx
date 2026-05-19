'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function OwnerBrainPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    ai,
    setAI,
  ] = useState({

    health: 'GOOD',

    expansion: 'STABLE',

    staffing: 'OPTIMAL',

    risk: 'LOW',

    growth: 'NORMAL',

    recommendation: '',

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

    let revenue = 0
    let cost = 0
    let orders = 0

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

        orders +=
          Number(
            row.quantity || 0
          )
      }
    )

    const foodCost =
      revenue > 0
        ? (
            (cost / revenue) *
            100
          )
        : 0

    const avgOrder =
      orders > 0
        ? revenue / orders
        : 0

    const lowStock =
      (ingredients || [])
        .filter(
          i =>
            Number(
              i.quantity || 0
            ) <= 5
        )

    const activeTables =
      (tables || [])
        .filter(
          t =>
            t.status ===
            'ACTIVE'
        )

    let health =
      'GOOD'

    let expansion =
      'STABLE'

    let staffing =
      'OPTIMAL'

    let risk =
      'LOW'

    let growth =
      'NORMAL'

    const alerts =
      []

    if (
      foodCost > 40
    ) {

      health =
        'CRITICAL'

      risk =
        'HIGH'

      alerts.push(
        'Food cost exceeds operational safety'
      )
    }

    if (
      lowStock.length >= 5
    ) {

      expansion =
        'BLOCKED'

      alerts.push(
        'Inventory instability detected'
      )
    }

    if (
      avgOrder < 250
    ) {

      growth =
        'WEAK'

      alerts.push(
        'Average order value below target'
      )
    }

    if (
      activeTables.length >= 15
    ) {

      staffing =
        'UNDER PRESSURE'

      alerts.push(
        'High table load detected'
      )
    }

    let recommendation =
      'Operations stable. Continue optimization.'

    if (
      health ===
      'CRITICAL'
    ) {

      recommendation =
        'Immediate operational intervention required before scaling.'

    } else if (
      expansion ===
      'BLOCKED'
    ) {

      recommendation =
        'Stabilize procurement and inventory before growth.'

    } else if (
      growth ===
      'WEAK'
    ) {

      recommendation =
        'Increase upselling and menu engineering.'
    }

    setAI({

      health,

      expansion,

      staffing,

      risk,

      growth,

      recommendation,

      alerts,
    })
  }

  function color(
    value
  ) {

    if (
      value ===
        'CRITICAL' ||
      value ===
        'HIGH' ||
      value ===
        'BLOCKED' ||
      value ===
        'WEAK'
    ) {

      return 'text-red-400'
    }

    if (
      value ===
        'UNDER PRESSURE' ||
      value ===
        'NORMAL' ||
      value ===
        'STABLE'
    ) {

      return 'text-yellow-400'
    }

    return 'text-emerald-400'
  }

  return (

    <PageWrapper
      title="Owner Brain"
      subtitle="AI strategic operating intelligence"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-5 gap-4 mb-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Health
            </div>

            <div className={`text-3xl font-light ${
              color(
                ai.health
              )
            }`}>

              {
                ai.health
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Expansion
            </div>

            <div className={`text-3xl font-light ${
              color(
                ai.expansion
              )
            }`}>

              {
                ai.expansion
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Staffing
            </div>

            <div className={`text-3xl font-light ${
              color(
                ai.staffing
              )
            }`}>

              {
                ai.staffing
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Risk
            </div>

            <div className={`text-3xl font-light ${
              color(
                ai.risk
              )
            }`}>

              {
                ai.risk
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Growth
            </div>

            <div className={`text-3xl font-light ${
              color(
                ai.growth
              )
            }`}>

              {
                ai.growth
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-2 gap-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              AI Strategic Recommendation
            </div>

            <div className="text-2xl text-zinc-300 leading-relaxed">
              {
                ai.recommendation
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              Live Alerts
            </div>

            <div className="space-y-4">

              {ai.alerts.map(
                (
                  alert,
                  index
                ) => (

                  <div
                    key={index}
                    className="bg-black border border-zinc-800 rounded-2xl p-4 text-lg"
                  >

                    {
                      alert
                    }

                  </div>

                )
              )}

              {ai.alerts
                .length === 0 && (

                <div className="bg-black border border-zinc-800 rounded-2xl p-4 text-emerald-400">
                  No operational risks detected
                </div>

              )}

            </div>

          </div>

        </div>

      </div>

    </PageWrapper>
  )
}
