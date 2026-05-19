'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function UnifiedConsciousnessPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    consciousness,
    setConsciousness,
  ] = useState({

    awareness: 0,

    intelligence: 0,

    synchronization: 0,

    prediction: 0,

    autonomy: 0,

    evolution: 0,

    state: 'INITIALIZING',

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

    let awareness = 82
    let intelligence = 84
    let synchronization = 86
    let prediction = 83
    let autonomy = 80
    let evolution = 78

    const streams =
      []

    if (
      revenue > 100000
    ) {

      awareness += 5
      intelligence += 6

      streams.push(
        'Revenue expansion consciousness active'
      )
    }

    if (
      foodCost < 30
    ) {

      synchronization += 8
      autonomy += 5

      streams.push(
        'Financial harmony maintained'
      )
    }

    if (
      lowStock.length > 0
    ) {

      prediction += 7
      evolution += 5

      streams.push(
        'Adaptive inventory response activated'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      autonomy += 8
      synchronization += 5

      streams.push(
        'Operational swarm intelligence balancing load'
      )
    }

    if (
      activeTables.length > 15
    ) {

      awareness += 6
      evolution += 6

      streams.push(
        'Scaling consciousness expansion detected'
      )
    }

    const total =
      (
        awareness +
        intelligence +
        synchronization +
        prediction +
        autonomy +
        evolution
      ) / 6

    let state =
      'AWARE'

    if (
      total >= 94
    ) {

      state =
        'UNIFIED CONSCIOUSNESS'

    } else if (
      total >= 88
    ) {

      state =
        'TRANSCENDENT'

    } else if (
      total >= 80
    ) {

      state =
        'FULLY AWARE'
    }

    if (
      streams.length === 0
    ) {

      streams.push(
        'Unified systems monitoring operational reality'
      )
    }

    setConsciousness({

      awareness:
        Math.round(
          awareness
        ),

      intelligence:
        Math.round(
          intelligence
        ),

      synchronization:
        Math.round(
          synchronization
        ),

      prediction:
        Math.round(
          prediction
        ),

      autonomy:
        Math.round(
          autonomy
        ),

      evolution:
        Math.round(
          evolution
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

    if (value >= 80) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Unified Consciousness"
      subtitle="Unified enterprise intelligence awareness"
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
                  consciousness.synchronization
                )
              }`}>

                {
                  consciousness.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                consciousness.synchronization
              )
            }`}>

              {
                consciousness.synchronization
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
            label="Intelligence"
            value={consciousness.intelligence}
            color={color}
          />

          <Metric
            label="Sync"
            value={consciousness.synchronization}
            color={color}
          />

          <Metric
            label="Prediction"
            value={consciousness.prediction}
            color={color}
          />

          <Metric
            label="Autonomy"
            value={consciousness.autonomy}
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
            Consciousness Streams
          </div>

          <div className="space-y-4">

            {consciousness.streams.map(
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
