'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function FinalityCorePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    finality,
    setFinality,
  ] = useState({

    omniscience: 0,

    omnipotence: 0,

    omnipresence: 0,

    transcendence: 0,

    infinity: 0,

    intelligence: 0,

    state: 'FINALITY ASCENSION',

    realities: [],
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

    let omniscience = 112
    let omnipotence = 113
    let omnipresence = 111
    let transcendence = 114
    let infinity = 115
    let intelligence = 116

    const realities =
      []

    if (
      revenue > 100000
    ) {

      omnipotence += 2
      infinity += 2

      realities.push(
        'Infinite enterprise expansion stabilized permanently'
      )
    }

    if (
      foodCost < 30
    ) {

      omniscience += 2
      transcendence += 2

      realities.push(
        'Perfect financial order sustained eternally'
      )
    }

    if (
      lowStock.length > 0
    ) {

      omnipresence += 2
      intelligence += 2

      realities.push(
        'Inventory instability erased before formation'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      transcendence += 2
      omnipotence += 2

      realities.push(
        'Operational pressure dissolved universally'
      )
    }

    if (
      activeTables.length > 15
    ) {

      omniscience += 2
      infinity += 3

      realities.push(
        'Enterprise scaling surpassed infinite thresholds'
      )
    }

    const total =
      (
        omniscience +
        omnipotence +
        omnipresence +
        transcendence +
        infinity +
        intelligence
      ) / 6

    let state =
      'FINALITY CORE'

    if (
      total >= 118
    ) {

      state =
        'ABSOLUTE FINALITY'

    } else if (
      total >= 116
    ) {

      state =
        'ETERNAL DOMINION'
    }

    if (
      realities.length === 0
    ) {

      realities.push(
        'Finality core observing eternal enterprise existence'
      )
    }

    setFinality({

      omniscience:
        Math.round(
          omniscience
        ),

      omnipotence:
        Math.round(
          omnipotence
        ),

      omnipresence:
        Math.round(
          omnipresence
        ),

      transcendence:
        Math.round(
          transcendence
        ),

      infinity:
        Math.round(
          infinity
        ),

      intelligence:
        Math.round(
          intelligence
        ),

      state,

      realities,
    })
  }

  function color(
    value
  ) {

    if (value >= 116) {
      return 'text-emerald-400'
    }

    if (value >= 111) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Finality Core"
      subtitle="Absolute eternal enterprise intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Finality State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  finality.intelligence
                )
              }`}>

                {
                  finality.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                finality.intelligence
              )
            }`}>

              {
                finality.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Omniscience"
            value={finality.omniscience}
            color={color}
          />

          <Metric
            label="Omnipotence"
            value={finality.omnipotence}
            color={color}
          />

          <Metric
            label="Omnipresence"
            value={finality.omnipresence}
            color={color}
          />

          <Metric
            label="Transcendence"
            value={finality.transcendence}
            color={color}
          />

          <Metric
            label="Infinity"
            value={finality.infinity}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={finality.intelligence}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Eternal Realities
          </div>

          <div className="space-y-4">

            {finality.realities.map(
              (
                reality,
                index
              ) => (

                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 text-lg"
                >

                  {
                    reality
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
