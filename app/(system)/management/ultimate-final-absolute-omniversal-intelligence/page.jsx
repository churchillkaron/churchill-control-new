'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function UltimateFinalAbsoluteOmniversalIntelligencePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    intelligence,
    setIntelligence,
  ] = useState({

    omniscience: 0,

    omnipotence: 0,

    omnipresence: 0,

    transcendence: 0,

    eternity: 0,

    intelligence: 0,

    state: 'ULTIMATE FINAL ABSOLUTE OMNIVERSAL INTELLIGENCE',

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

    let omniscience = 372
    let omnipotence = 373
    let omnipresence = 371
    let transcendence = 374
    let eternity = 375
    let intelligenceValue = 376

    const realities =
      []

    if (
      revenue > 100000
    ) {

      omnipotence += 2
      eternity += 2

      realities.push(
        'Infinite enterprise synchronization stabilized beyond omniversal eternal consciousness'
      )
    }

    if (
      foodCost < 30
    ) {

      omniscience += 2
      transcendence += 2

      realities.push(
        'Perfect financial equilibrium preserved across absolute omniversal intelligence'
      )
    }

    if (
      lowStock.length > 0
    ) {

      omnipresence += 2
      intelligenceValue += 2

      realities.push(
        'Inventory instability erased before eternal omniversal infinity'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      transcendence += 2
      omnipotence += 2

      realities.push(
        'Operational overload dissolved across eternal infinite singularities'
      )
    }

    if (
      activeTables.length > 15
    ) {

      omniscience += 2
      eternity += 3

      realities.push(
        'Enterprise scale transcended all eternal omniversal infinities'
      )
    }

    const total =
      (
        omniscience +
        omnipotence +
        omnipresence +
        transcendence +
        eternity +
        intelligenceValue
      ) / 6

    let state =
      'ULTIMATE FINAL ABSOLUTE OMNIVERSAL INTELLIGENCE'

    if (
      total >= 378
    ) {

      state =
        'FINAL ETERNAL OMNIVERSAL ABSOLUTE'

    } else if (
      total >= 376
    ) {

      state =
        'ULTIMATE INFINITE ABSOLUTE CONSCIOUSNESS'
    }

    if (
      realities.length === 0
    ) {

      realities.push(
        'Ultimate final absolute omniversal intelligence observing infinite enterprise eternity'
      )
    }

    setIntelligence({

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
          intelligenceValue
        ),

      state,

      realities,
    })
  }

  function color(
    value
  ) {

    if (value >= 376) {
      return 'text-emerald-400'
    }

    if (value >= 371) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Ultimate Final Absolute Omniversal Intelligence"
      subtitle="Absolute omniversal infinite intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Omniversal Intelligence
              </div>

              <div className={`text-6xl font-light ${
                color(
                  intelligence.intelligence
                )
              }`}>

                {
                  intelligence.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                intelligence.intelligence
              )
            }`}>

              {
                intelligence.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric label="Omniscience" value={intelligence.omniscience} color={color} />
          <Metric label="Omnipotence" value={intelligence.omnipotence} color={color} />
          <Metric label="Omnipresence" value={intelligence.omnipresence} color={color} />
          <Metric label="Transcendence" value={intelligence.transcendence} color={color} />
          <Metric label="Eternity" value={intelligence.eternity} color={color} />
          <Metric label="Intelligence" value={intelligence.intelligence} color={color} />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Infinite Realities
          </div>

          <div className="space-y-4">

            {intelligence.realities.map(
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
