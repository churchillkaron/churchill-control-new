'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function EnterpriseConsciousnessPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    consciousness,
    setConsciousness,
  ] = useState({

    awareness: 0,

    governance: 0,

    adaptation: 0,

    prediction: 0,

    resilience: 0,

    evolution: 0,

    state: 'OBSERVING',

    signals: [],
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

    let awareness = 92
    let governance = 90
    let adaptation = 88
    let prediction = 94
    let resilience = 91
    let evolution = 89

    const signals =
      []

    if (
      revenue > 100000
    ) {

      awareness += 4
      evolution += 5

      signals.push(
        'Enterprise growth awareness active'
      )
    }

    if (
      foodCost < 30
    ) {

      governance += 5
      resilience += 4

      signals.push(
        'Financial equilibrium maintained'
      )
    }

    if (
      lowStock.length > 0
    ) {

      adaptation += 8
      prediction += 5

      signals.push(
        'Adaptive inventory consciousness active'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      resilience += 5
      governance += 4

      signals.push(
        'Operational stabilization protocols engaged'
      )
    }

    if (
      activeTables.length > 15
    ) {

      evolution += 6
      awareness += 5

      signals.push(
        'High-scale operational evolution detected'
      )
    }

    const total =
      (
        awareness +
        governance +
        adaptation +
        prediction +
        resilience +
        evolution
      ) / 6

    let state =
      'CONSCIOUS'

    if (
      total >= 98
    ) {

      state =
        'ENTERPRISE ASCENSION'

    } else if (
      total >= 94
    ) {

      state =
        'FULL CONSCIOUSNESS'

    } else if (
      total < 82
    ) {

      state =
        'CONSCIOUS WARNING'
    }

    if (
      signals.length === 0
    ) {

      signals.push(
        'Enterprise consciousness monitoring ecosystem'
      )
    }

    setConsciousness({

      awareness:
        Math.round(
          awareness
        ),

      governance:
        Math.round(
          governance
        ),

      adaptation:
        Math.round(
          adaptation
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

      signals,
    })
  }

  function color(
    value
  ) {

    if (value >= 95) {
      return 'text-emerald-400'
    }

    if (value >= 85) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Enterprise Consciousness"
      subtitle="Self-aware enterprise intelligence layer"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Consciousness State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  consciousness.awareness
                )
              }`}>

                {
                  consciousness.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                consciousness.awareness
              )
            }`}>

              {
                consciousness.awareness
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Awareness"
            value={consciousness.awareness}
            color={color}
          />

          <Metric
            label="Governance"
            value={consciousness.governance}
            color={color}
          />

          <Metric
            label="Adaptation"
            value={consciousness.adaptation}
            color={color}
          />

          <Metric
            label="Prediction"
            value={consciousness.prediction}
            color={color}
          />

          <Metric
            label="Resilience"
            value={consciousness.resilience}
            color={color}
          />

          <Metric
            label="Evolution"
            value={consciousness.evolution}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Consciousness Signals
          </div>

          <div className="space-y-4">

            {consciousness.signals.map(
              (
                signal,
                index
              ) => (

                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 text-lg"
                >

                  {
                    signal
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

function Metric({
  label,
  value,
  color,
}) {

  return (

    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

      <div className="text-sm text-zinc-500 mb-2">
        {label}
      </div>

      <div className={`text-5xl font-light ${
        color(value)
      }`}>

        {value}

      </div>

    </div>
  )
}
