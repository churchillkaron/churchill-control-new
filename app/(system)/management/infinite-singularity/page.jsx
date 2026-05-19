'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function InfiniteSingularityPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    singularity,
    setSingularity,
  ] = useState({

    omniscience: 0,

    omnipotence: 0,

    omnipresence: 0,

    transcendence: 0,

    eternity: 0,

    intelligence: 0,

    state: 'INFINITE SINGULARITY',

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

    let omniscience = 196
    let omnipotence = 197
    let omnipresence = 195
    let transcendence = 198
    let eternity = 199
    let intelligence = 200

    const realities =
      []

    if (
      revenue > 100000
    ) {

      omnipotence += 2
      eternity += 2

      realities.push(
        'Infinite enterprise synchronization stabilized beyond all existence'
      )
    }

    if (
      foodCost < 30
    ) {

      omniscience += 2
      transcendence += 2

      realities.push(
        'Perfect financial equilibrium preserved beyond infinity'
      )
    }

    if (
      lowStock.length > 0
    ) {

      omnipresence += 2
      intelligence += 2

      realities.push(
        'Inventory instability erased before dimensional creation'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      transcendence += 2
      omnipotence += 2

      realities.push(
        'Operational overload dissolved across eternal omniverses'
      )
    }

    if (
      activeTables.length > 15
    ) {

      omniscience += 2
      eternity += 3

      realities.push(
        'Enterprise scale transcended infinite eternal reality'
      )
    }

    const total =
      (
        omniscience +
        omnipotence +
        omnipresence +
        transcendence +
        eternity +
        intelligence
      ) / 6

    let state =
      'INFINITE SINGULARITY'

    if (
      total >= 202
    ) {

      state =
        'ABSOLUTE SINGULARITY'

    } else if (
      total >= 200
    ) {

      state =
        'ETERNAL ABSOLUTE'
    }

    if (
      realities.length === 0
    ) {

      realities.push(
        'Infinite singularity observing eternal enterprise infinity'
      )
    }

    setSingularity({

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

      eternity:
        Math.round(
          eternity
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

    if (value >= 200) {
      return 'text-emerald-400'
    }

    if (value >= 195) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Infinite Singularity"
      subtitle="Absolute infinite singularity intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Singularity State
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

            <div className={`text-8xl font-light ${
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

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric label="Omniscience" value={singularity.omniscience} color={color} />
          <Metric label="Omnipotence" value={singularity.omnipotence} color={color} />
          <Metric label="Omnipresence" value={singularity.omnipresence} color={color} />
          <Metric label="Transcendence" value={singularity.transcendence} color={color} />
          <Metric label="Eternity" value={singularity.eternity} color={color} />
          <Metric label="Intelligence" value={singularity.intelligence} color={color} />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Infinite Realities
          </div>

          <div className="space-y-4">

            {singularity.realities.map(
              (
                reality,
                index
              ) => (

                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 text-lg"
                >

                  {reality}

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

      <div className={`text-5xl font-light ${color(value)}`}>

        {value}

      </div>

    </div>

  )
}
