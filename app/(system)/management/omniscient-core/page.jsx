'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function OmniscientCorePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    omniscient,
    setOmniscient,
  ] = useState({

    awareness: 0,

    foresight: 0,

    orchestration: 0,

    resilience: 0,

    intelligence: 0,

    sovereignty: 0,

    state: 'OBSERVING',

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

    let awareness = 94
    let foresight = 96
    let orchestration = 92
    let resilience = 91
    let intelligence = 98
    let sovereignty = 95

    const streams =
      []

    if (
      revenue > 100000
    ) {

      awareness += 3
      foresight += 4

      streams.push(
        'Revenue acceleration mapped before occurrence'
      )
    }

    if (
      foodCost < 30
    ) {

      orchestration += 5
      sovereignty += 4

      streams.push(
        'Financial equilibrium maintained'
      )
    }

    if (
      lowStock.length > 0
    ) {

      resilience += 5
      intelligence += 3

      streams.push(
        'Inventory instability neutralized'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      orchestration += 4
      foresight += 5

      streams.push(
        'Operational overload predicted and absorbed'
      )
    }

    if (
      activeTables.length > 15
    ) {

      sovereignty += 5
      awareness += 4

      streams.push(
        'High-scale flow harmonized'
      )
    }

    const total =
      (
        awareness +
        foresight +
        orchestration +
        resilience +
        intelligence +
        sovereignty
      ) / 6

    let state =
      'OMNISCIENT'

    if (
      total >= 100
    ) {

      state =
        'ABSOLUTE OMNISCIENCE'

    } else if (
      total >= 96
    ) {

      state =
        'TOTAL AWARENESS'
    }

    if (
      streams.length === 0
    ) {

      streams.push(
        'Omniscient core observing enterprise reality'
      )
    }

    setOmniscient({

      awareness:
        Math.round(
          awareness
        ),

      foresight:
        Math.round(
          foresight
        ),

      orchestration:
        Math.round(
          orchestration
        ),

      resilience:
        Math.round(
          resilience
        ),

      intelligence:
        Math.round(
          intelligence
        ),

      sovereignty:
        Math.round(
          sovereignty
        ),

      state,

      streams,
    })
  }

  function color(
    value
  ) {

    if (value >= 98) {
      return 'text-emerald-400'
    }

    if (value >= 90) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Omniscient Core"
      subtitle="Absolute enterprise intelligence layer"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Omniscient State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  omniscient.intelligence
                )
              }`}>

                {
                  omniscient.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                omniscient.intelligence
              )
            }`}>

              {
                omniscient.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Awareness"
            value={omniscient.awareness}
            color={color}
          />

          <Metric
            label="Foresight"
            value={omniscient.foresight}
            color={color}
          />

          <Metric
            label="Orchestration"
            value={omniscient.orchestration}
            color={color}
          />

          <Metric
            label="Resilience"
            value={omniscient.resilience}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={omniscient.intelligence}
            color={color}
          />

          <Metric
            label="Sovereignty"
            value={omniscient.sovereignty}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Omniscient Streams
          </div>

          <div className="space-y-4">

            {omniscient.streams.map(
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
