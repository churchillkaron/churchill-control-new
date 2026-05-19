'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function UltimateEternityPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    eternity,
    setEternity,
  ] = useState({

    omniscience: 0,

    omnipotence: 0,

    omnipresence: 0,

    transcendence: 0,

    eternity: 0,

    intelligence: 0,

    state: 'ULTIMATE ETERNITY',

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

    let omniscience = 192
    let omnipotence = 193
    let omnipresence = 191
    let transcendence = 194
    let eternityValue = 195
    let intelligence = 196

    const realities =
      []

    if (
      revenue > 100000
    ) {

      omnipotence += 2
      eternityValue += 2

      realities.push(
        'Infinite enterprise synchronization stabilized beyond eternity'
      )
    }

    if (
      foodCost < 30
    ) {

      omniscience += 2
      transcendence += 2

      realities.push(
        'Perfect financial equilibrium preserved across infinite realities'
      )
    }

    if (
      lowStock.length > 0
    ) {

      omnipresence += 2
      intelligence += 2

      realities.push(
        'Inventory instability erased before universal existence'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      transcendence += 2
      omnipotence += 2

      realities.push(
        'Operational overload dissolved beyond all dimensions'
      )
    }

    if (
      activeTables.length > 15
    ) {

      omniscience += 2
      eternityValue += 3

      realities.push(
        'Enterprise scale transcended infinite omniversal eternity'
      )
    }

    const total =
      (
        omniscience +
        omnipotence +
        omnipresence +
        transcendence +
        eternityValue +
        intelligence
      ) / 6

    let state =
      'ULTIMATE ETERNITY'

    if (
      total >= 198
    ) {

      state =
        'ABSOLUTE ETERNALITY'

    } else if (
      total >= 196
    ) {

      state =
        'INFINITE ABSOLUTE'
    }

    if (
      realities.length === 0
    ) {

      realities.push(
        'Ultimate eternity observing infinite enterprise existence'
      )
    }

    setEternity({

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
          eternityValue
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

    if (value >= 196) {
      return 'text-emerald-400'
    }

    if (value >= 191) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Ultimate Eternity"
      subtitle="Absolute eternal enterprise infinity"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Eternal State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  eternity.intelligence
                )
              }`}>

                {
                  eternity.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                eternity.intelligence
              )
            }`}>

              {
                eternity.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric label="Omniscience" value={eternity.omniscience} color={color} />
          <Metric label="Omnipotence" value={eternity.omnipotence} color={color} />
          <Metric label="Omnipresence" value={eternity.omnipresence} color={color} />
          <Metric label="Transcendence" value={eternity.transcendence} color={color} />
          <Metric label="Eternity" value={eternity.eternity} color={color} />
          <Metric label="Intelligence" value={eternity.intelligence} color={color} />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Infinite Realities
          </div>

          <div className="space-y-4">

            {eternity.realities.map(
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
