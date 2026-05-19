'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function QuantumCorePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    quantum,
    setQuantum,
  ] = useState({

    probability: 0,

    forecasting: 0,

    optimization: 0,

    adaptation: 0,

    decisionSpeed: 0,

    stability: 0,

    state: 'CALCULATING',

    quantumSignals: [],
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

    let probability = 82
    let forecasting = 84
    let optimization = 80
    let adaptation = 78
    let decisionSpeed = 86
    let stability = 88

    const quantumSignals =
      []

    if (
      revenue > 100000
    ) {

      probability += 5
      forecasting += 6

      quantumSignals.push(
        'Revenue probability expansion detected'
      )
    }

    if (
      foodCost < 30
    ) {

      optimization += 10

      quantumSignals.push(
        'Financial optimization stable'
      )
    }

    if (
      lowStock.length > 0
    ) {

      adaptation += 8
      stability -= 5

      quantumSignals.push(
        'Inventory uncertainty absorbed'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      decisionSpeed += 5
      forecasting += 4

      quantumSignals.push(
        'Operational acceleration protocol active'
      )
    }

    const total =
      (
        probability +
        forecasting +
        optimization +
        adaptation +
        decisionSpeed +
        stability
      ) / 6

    let state =
      'ADAPTIVE'

    if (
      total >= 92
    ) {

      state =
        'QUANTUM ASCENSION'

    } else if (
      total >= 85
    ) {

      state =
        'QUANTUM STABLE'
    }

    if (
      quantumSignals.length === 0
    ) {

      quantumSignals.push(
        'Quantum systems monitoring environment'
      )
    }

    setQuantum({

      probability:
        Math.round(
          probability
        ),

      forecasting:
        Math.round(
          forecasting
        ),

      optimization:
        Math.round(
          optimization
        ),

      adaptation:
        Math.round(
          adaptation
        ),

      decisionSpeed:
        Math.round(
          decisionSpeed
        ),

      stability:
        Math.round(
          stability
        ),

      state,

      quantumSignals,
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
      title="Quantum Core"
      subtitle="Quantum enterprise intelligence layer"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Quantum State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  quantum.stability
                )
              }`}>

                {
                  quantum.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                quantum.stability
              )
            }`}>

              {
                quantum.stability
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Probability"
            value={quantum.probability}
            color={color}
          />

          <Metric
            label="Forecast"
            value={quantum.forecasting}
            color={color}
          />

          <Metric
            label="Optimization"
            value={quantum.optimization}
            color={color}
          />

          <Metric
            label="Adaptation"
            value={quantum.adaptation}
            color={color}
          />

          <Metric
            label="Decision"
            value={quantum.decisionSpeed}
            color={color}
          />

          <Metric
            label="Stability"
            value={quantum.stability}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Quantum Signals
          </div>

          <div className="space-y-4">

            {quantum.quantumSignals.map(
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
