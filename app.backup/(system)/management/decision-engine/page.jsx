"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function DecisionEnginePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    decisions,
    setDecisions,
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

    const engine = []

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

    if (
      foodCost > 40
    ) {

      engine.push({

        type:
          'FINANCE',

        priority:
          'CRITICAL',

        decision:
          'Reduce recipe cost immediately',

        impact:
          'Protect profitability',
      })
    }

    if (
      avgOrder < 250
    ) {

      engine.push({

        type:
          'SALES',

        priority:
          'HIGH',

        decision:
          'Increase upselling strategy',

        impact:
          'Raise average order value',
      })
    }

    if (
      lowStock.length >= 5
    ) {

      engine.push({

        type:
          'PROCUREMENT',

        priority:
          'HIGH',

        decision:
          'Emergency ingredient replenishment',

        impact:
          'Avoid operational interruption',
      })
    }

    if (
      activeTables.length >= 15
    ) {

      engine.push({

        type:
          'OPERATIONS',

        priority:
          'MEDIUM',

        decision:
          'Increase floor staffing',

        impact:
          'Maintain service quality',
      })
    }

    if (
      engine.length === 0
    ) {

      engine.push({

        type:
          'SYSTEM',

        priority:
          'LOW',

        decision:
          'No operational actions required',

        impact:
          'Operations stable',
      })
    }

    setDecisions(
      engine
    )
  }

  function color(
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
      'HIGH'
    ) {

      return 'text-yellow-400'
    }

    return 'text-emerald-400'
  }

  return (

    <PageWrapper
      title="Decision Engine"
      subtitle="AI business decision system"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-2 gap-6">

          {decisions.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-start justify-between mb-6">

                  <div>

                    <div className="text-2xl font-semibold">
                      {
                        item.type
                      }
                    </div>

                    <div className="text-sm text-zinc-500 mt-2">
                      AI Decision
                    </div>

                  </div>

                  <div className={`text-sm font-semibold ${
                    color(
                      item.priority
                    )
                  }`}>

                    {
                      item.priority
                    }

                  </div>

                </div>

                <div className="text-xl leading-relaxed mb-6">

                  {
                    item.decision
                  }

                </div>

                <div className="bg-black border border-zinc-800 rounded-2xl p-4">

                  <div className="text-sm text-zinc-500 mb-2">
                    Expected Impact
                  </div>

                  <div className="text-lg text-emerald-400">

                    {
                      item.impact
                    }

                  </div>

                </div>

              </div>

            )
          )}

        </div>

      </div>

    </PageWrapper>
  )
}
