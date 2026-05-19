'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function MetaIntelligencePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    meta,
    setMeta,
  ] = useState({

    awareness: 0,

    adaptation: 0,

    orchestration: 0,

    intelligence: 0,

    optimization: 0,

    autonomy: 0,

    state: 'ANALYZING',

    streams: [],
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

    let awareness = 86
    let adaptation = 82
    let orchestration = 84
    let intelligence = 88
    let optimization = 85
    let autonomy = 83

    const streams =
      []

    if (
      revenue > 100000
    ) {

      intelligence += 5
      orchestration += 5

      streams.push(
        'Revenue intelligence amplification active'
      )
    }

    if (
      foodCost < 30
    ) {

      optimization += 8
      autonomy += 5

      streams.push(
        'Financial optimization loop stable'
      )
    }

    if (
      lowStock.length > 0
    ) {

      adaptation += 10
      awareness += 5

      streams.push(
        'Inventory adaptation intelligence active'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      orchestration += 8
      autonomy += 5

      streams.push(
        'Operational orchestration balancing workload'
      )
    }

    if (
      activeTables.length > 15
    ) {

      awareness += 6
      intelligence += 4

      streams.push(
        'Scaling intelligence expansion detected'
      )
    }

    const total =
      (
        awareness +
        adaptation +
        orchestration +
        intelligence +
        optimization +
        autonomy
      ) / 6

    let state =
      'META AWARE'

    if (
      total >= 96
    ) {

      state =
        'META CONSCIOUSNESS'

    } else if (
      total >= 90
    ) {

      state =
        'META EVOLUTION'

    } else if (
      total >= 84
    ) {

      state =
        'META STABLE'
    }

    if (
      streams.length === 0
    ) {

      streams.push(
        'Meta intelligence monitoring operational reality'
      )
    }

    setMeta({

      awareness:
        Math.round(
          awareness
        ),

      adaptation:
        Math.round(
          adaptation
        ),

      orchestration:
        Math.round(
          orchestration
        ),

      intelligence:
        Math.round(
          intelligence
        ),

      optimization:
        Math.round(
          optimization
        ),

      autonomy:
        Math.round(
          autonomy
        ),

      state,

      streams,
    })
  }

  function color(
    value
  ) {

    if (value >= 92) {
      return 'text-emerald-400'
    }

    if (value >= 82) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Meta Intelligence"
      subtitle="Unified enterprise orchestration intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Meta State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  meta.intelligence
                )
              }`}>

                {
                  meta.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                meta.intelligence
              )
            }`}>

              {
                meta.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Awareness"
            value={meta.awareness}
            color={color}
          />

          <Metric
            label="Adaptation"
            value={meta.adaptation}
            color={color}
          />

          <Metric
            label="Orchestration"
            value={meta.orchestration}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={meta.intelligence}
            color={color}
          />

          <Metric
            label="Optimization"
            value={meta.optimization}
            color={color}
          />

          <Metric
            label="Autonomy"
            value={meta.autonomy}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Meta Streams
          </div>

          <div className="space-y-4">

            {meta.streams.map(
              (
                stream,
                index
              ) => (

                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 text-lg"
                >

                  {
                    stream
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
