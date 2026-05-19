'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function GlobalBrainPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    brain,
    setBrain,
  ] = useState({

    operationalIQ: 0,

    financialIQ: 0,

    automationIQ: 0,

    riskIQ: 0,

    totalIQ: 0,

    state: 'STABLE',

    insights: [],
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

    let operationalIQ = 100
    let financialIQ = 100
    let automationIQ = 75
    let riskIQ = 100

    const insights =
      []

    if (
      foodCost > 40
    ) {

      financialIQ -= 40
      riskIQ -= 30

      insights.push(
        'Financial pressure detected'
      )
    }

    if (
      lowStock.length >= 5
    ) {

      operationalIQ -= 30
      riskIQ -= 20

      insights.push(
        'Inventory instability detected'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      operationalIQ -= 20

      insights.push(
        'Kitchen overload active'
      )
    }

    if (
      activeTables.length > 15
    ) {

      automationIQ += 10

      insights.push(
        'AI scaling operations correctly'
      )
    }

    const totalIQ =
      Math.max(
        0,
        Math.round(
          (
            operationalIQ +
            financialIQ +
            automationIQ +
            riskIQ
          ) / 4
        )
      )

    let state =
      'STABLE'

    if (
      totalIQ < 50
    ) {

      state =
        'CRITICAL'

    } else if (
      totalIQ < 75
    ) {

      state =
        'WARNING'
    }

    if (
      insights.length === 0
    ) {

      insights.push(
        'All operational systems healthy'
      )
    }

    setBrain({

      operationalIQ,

      financialIQ,

      automationIQ,

      riskIQ,

      totalIQ,

      state,

      insights,
    })
  }

  function color(
    value
  ) {

    if (value < 50) {
      return 'text-red-400'
    }

    if (value < 75) {
      return 'text-yellow-400'
    }

    return 'text-emerald-400'
  }

  return (

    <PageWrapper
      title="Global Brain"
      subtitle="Central AI intelligence core"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                System Intelligence
              </div>

              <div className={`text-7xl font-light ${
                color(
                  brain.totalIQ
                )
              }`}>

                {
                  brain.totalIQ
                }

              </div>

            </div>

            <div className="text-right">

              <div className="text-sm text-zinc-500 mb-2">
                System State
              </div>

              <div className={`text-5xl font-light ${
                color(
                  brain.totalIQ
                )
              }`}>

                {
                  brain.state
                }

              </div>

            </div>

          </div>

        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Operational IQ
            </div>

            <div className={`text-5xl font-light ${
              color(
                brain.operationalIQ
              )
            }`}>

              {
                brain.operationalIQ
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Financial IQ
            </div>

            <div className={`text-5xl font-light ${
              color(
                brain.financialIQ
              )
            }`}>

              {
                brain.financialIQ
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Automation IQ
            </div>

            <div className={`text-5xl font-light ${
              color(
                brain.automationIQ
              )
            }`}>

              {
                brain.automationIQ
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Risk IQ
            </div>

            <div className={`text-5xl font-light ${
              color(
                brain.riskIQ
              )
            }`}>

              {
                brain.riskIQ
              }

            </div>

          </div>

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            AI Insights
          </div>

          <div className="space-y-4">

            {brain.insights.map(
              (
                insight,
                index
              ) => (

                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 text-lg"
                >

                  {
                    insight
                  }

                </div>

              )
            )}

          </div>

        </div>

      </div>

    </PageWrapper>
  )
}
