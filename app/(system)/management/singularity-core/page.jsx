'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function SingularityCorePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    singularity,
    setSingularity,
  ] = useState({

    intelligence: 0,

    autonomy: 0,

    optimization: 0,

    prediction: 0,

    resilience: 0,

    evolution: 0,

    state: 'INITIALIZING',

    directives: [],
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

    let intelligence = 75
    let autonomy = 70
    let optimization = 72
    let prediction = 78
    let resilience = 74
    let evolution = 68

    const directives =
      []

    if (
      revenue > 100000
    ) {

      intelligence += 8
      evolution += 5

      directives.push(
        'Revenue growth trajectory accelerating'
      )
    }

    if (
      foodCost < 30
    ) {

      optimization += 10

      directives.push(
        'Operational efficiency stable'
      )
    }

    if (
      lowStock.length > 0
    ) {

      resilience += 5
      prediction += 5

      directives.push(
        'Inventory instability adaptation active'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      autonomy += 5
      prediction += 7

      directives.push(
        'AI balancing operational workload'
      )
    }

    if (
      activeTables.length > 15
    ) {

      evolution += 7

      directives.push(
        'Scaling behavior recognized'
      )
    }

    const total =
      (
        intelligence +
        autonomy +
        optimization +
        prediction +
        resilience +
        evolution
      ) / 6

    let state =
      'LEARNING'

    if (total >= 90) {

      state =
        'SINGULARITY'

    } else if (
      total >= 80
    ) {

      state =
        'SELF EVOLVING'

    } else if (
      total >= 70
    ) {

      state =
        'ADAPTIVE CORE'
    }

    if (
      directives.length === 0
    ) {

      directives.push(
        'Monitoring operational ecosystem'
      )
    }

    setSingularity({

      intelligence:
        Math.round(
          intelligence
        ),

      autonomy:
        Math.round(
          autonomy
        ),

      optimization:
        Math.round(
          optimization
        ),

      prediction:
        Math.round(
          prediction
        ),

      resilience:
        Math.round(
          resilience
        ),

      evolution:
        Math.round(
          evolution
        ),

      state,

      directives,
    })
  }

  function color(
    value
  ) {

    if (value >= 90) {
      return 'text-emerald-400'
    }

    if (value >= 75) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Singularity Core"
      subtitle="Autonomous enterprise intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Core State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  singularity.intelligence
                )
              }`}>

                {
                  singularity.state
                }

              </div>

            </div>

            <div className="text-right">

              <div className="text-sm text-zinc-500 mb-2">
                Neural Intelligence
              </div>

              <div className={`text-7xl font-light ${
                color(
                  singularity.intelligence
                )
              }`}>

                {
                  singularity.intelligence
                }

              </div>

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <div className="text-sm text-zinc-500 mb-2">
              Intelligence
            </div>
            <div className={`text-5xl font-light ${
              color(
                singularity.intelligence
              )
            }`}>
              {singularity.intelligence}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <div className="text-sm text-zinc-500 mb-2">
              Autonomy
            </div>
            <div className={`text-5xl font-light ${
              color(
                singularity.autonomy
              )
            }`}>
              {singularity.autonomy}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <div className="text-sm text-zinc-500 mb-2">
              Optimization
            </div>
            <div className={`text-5xl font-light ${
              color(
                singularity.optimization
              )
            }`}>
              {singularity.optimization}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <div className="text-sm text-zinc-500 mb-2">
              Prediction
            </div>
            <div className={`text-5xl font-light ${
              color(
                singularity.prediction
              )
            }`}>
              {singularity.prediction}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <div className="text-sm text-zinc-500 mb-2">
              Resilience
            </div>
            <div className={`text-5xl font-light ${
              color(
                singularity.resilience
              )
            }`}>
              {singularity.resilience}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <div className="text-sm text-zinc-500 mb-2">
              Evolution
            </div>
            <div className={`text-5xl font-light ${
              color(
                singularity.evolution
              )
            }`}>
              {singularity.evolution}
            </div>
          </div>

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Core Directives
          </div>

          <div className="space-y-4">

            {singularity.directives.map(
              (
                directive,
                index
              ) => (

                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 text-lg"
                >

                  {
                    directive
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
