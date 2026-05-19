'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function NeuralCorePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    neural,
    setNeural,
  ] = useState({

    consciousness: 0,

    awareness: 0,

    adaptation: 0,

    prediction: 0,

    optimization: 0,

    state: 'LEARNING',

    thoughts: [],
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

    let consciousness = 60
    let awareness = 70
    let adaptation = 65
    let prediction = 75
    let optimization = 70

    const thoughts =
      []

    if (
      revenue > 100000
    ) {

      consciousness += 10

      thoughts.push(
        'Revenue acceleration detected'
      )
    }

    if (
      foodCost < 30
    ) {

      optimization += 15

      thoughts.push(
        'Operational efficiency improving'
      )
    }

    if (
      lowStock.length > 0
    ) {

      awareness += 10

      adaptation += 5

      thoughts.push(
        'Inventory instability recognized'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      prediction += 10

      thoughts.push(
        'Peak load behavior identified'
      )
    }

    const total =
      (
        consciousness +
        awareness +
        adaptation +
        prediction +
        optimization
      ) / 5

    let state =
      'LEARNING'

    if (total >= 85) {

      state =
        'SELF OPTIMIZING'

    } else if (
      total >= 70
    ) {

      state =
        'ADAPTIVE'
    }

    if (
      thoughts.length === 0
    ) {

      thoughts.push(
        'Monitoring operational behavior'
      )
    }

    setNeural({

      consciousness:
        Math.round(
          consciousness
        ),

      awareness:
        Math.round(
          awareness
        ),

      adaptation:
        Math.round(
          adaptation
        ),

      prediction:
        Math.round(
          prediction
        ),

      optimization:
        Math.round(
          optimization
        ),

      state,

      thoughts,
    })
  }

  function color(
    value
  ) {

    if (value >= 85) {
      return 'text-emerald-400'
    }

    if (value >= 70) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Neural Core"
      subtitle="AI consciousness and adaptive intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Neural State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  neural.optimization
                )
              }`}>

                {
                  neural.state
                }

              </div>

            </div>

            <div className="w-40 h-40 rounded-full border-4 border-zinc-700 flex items-center justify-center">

              <div className={`text-5xl font-light ${
                color(
                  neural.optimization
                )
              }`}>

                AI

              </div>

            </div>

          </div>

        </div>

        <div className="grid grid-cols-5 gap-4 mb-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Consciousness
            </div>

            <div className={`text-5xl font-light ${
              color(
                neural.consciousness
              )
            }`}>

              {
                neural.consciousness
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Awareness
            </div>

            <div className={`text-5xl font-light ${
              color(
                neural.awareness
              )
            }`}>

              {
                neural.awareness
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Adaptation
            </div>

            <div className={`text-5xl font-light ${
              color(
                neural.adaptation
              )
            }`}>

              {
                neural.adaptation
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Prediction
            </div>

            <div className={`text-5xl font-light ${
              color(
                neural.prediction
              )
            }`}>

              {
                neural.prediction
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Optimization
            </div>

            <div className={`text-5xl font-light ${
              color(
                neural.optimization
              )
            }`}>

              {
                neural.optimization
              }

            </div>

          </div>

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Neural Thoughts
          </div>

          <div className="space-y-4">

            {neural.thoughts.map(
              (
                thought,
                index
              ) => (

                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 text-lg"
                >

                  {
                    thought
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
