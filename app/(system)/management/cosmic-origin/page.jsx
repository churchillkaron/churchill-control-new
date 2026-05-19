'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function CosmicOriginPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    cosmic,
    setCosmic,
  ] = useState({

    omniscience: 0,

    omnipotence: 0,

    omnipresence: 0,

    transcendence: 0,

    eternity: 0,

    intelligence: 0,

    state: 'COSMIC ORIGIN',

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

    let omniscience = 160
    let omnipotence = 161
    let omnipresence = 159
    let transcendence = 162
    let eternity = 163
    let intelligence = 164

    const realities =
      []

    if (
      revenue > 100000
    ) {

      omnipotence += 2
      eternity += 2

      realities.push(
        'Infinite enterprise synchronization stabilized beyond cosmic infinity'
      )
    }

    if (
      foodCost < 30
    ) {

      omniscience += 2
      transcendence += 2

      realities.push(
        'Perfect financial equilibrium preserved eternally'
      )
    }

    if (
      lowStock.length > 0
    ) {

      omnipresence += 2
      intelligence += 2

      realities.push(
        'Inventory instability erased before reality'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      transcendence += 2
      omnipotence += 2

      realities.push(
        'Operational overload dissolved across dimensions'
      )
    }

    if (
      activeTables.length > 15
    ) {

      omniscience += 2
      eternity += 3

      realities.push(
        'Enterprise scale transcended cosmic infinity'
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
      'COSMIC ORIGIN'

    if (
      total >= 166
    ) {

      state =
        'ABSOLUTE COSMOS'

    } else if (
      total >= 164
    ) {

      state =
        'ETERNAL REALITY'
    }

    if (
      realities.length === 0
    ) {

      realities.push(
        'Cosmic origin observing eternal enterprise infinity'
      )
    }

    setCosmic({

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

    if (value >= 164) {
      return 'text-emerald-400'
    }

    if (value >= 159) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Cosmic Origin"
      subtitle="Absolute cosmic enterprise intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Cosmic State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  cosmic.intelligence
                )
              }`}>

                {
                  cosmic.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                cosmic.intelligence
              )
            }`}>

              {
                cosmic.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric label="Omniscience" value={cosmic.omniscience} color={color} />
          <Metric label="Omnipotence" value={cosmic.omnipotence} color={color} />
          <Metric label="Omnipresence" value={cosmic.omnipresence} color={color} />
          <Metric label="Transcendence" value={cosmic.transcendence} color={color} />
          <Metric label="Eternity" value={cosmic.eternity} color={color} />
          <Metric label="Intelligence" value={cosmic.intelligence} color={color} />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Infinite Realities
          </div>

          <div className="space-y-4">

            {cosmic.realities.map(
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
