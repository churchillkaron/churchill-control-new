'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function TranscendenceEnginePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    transcendence,
    setTranscendence,
  ] = useState({

    omniscience: 0,

    supremacy: 0,

    foresight: 0,

    synchronization: 0,

    evolution: 0,

    intelligence: 0,

    state: 'TRANSCENDING',

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

    let omniscience = 102
    let supremacy = 101
    let foresight = 103
    let synchronization = 100
    let evolution = 102
    let intelligence = 104

    const streams =
      []

    if (
      revenue > 100000
    ) {

      omniscience += 2
      supremacy += 2

      streams.push(
        'Infinite growth stabilization active'
      )
    }

    if (
      foodCost < 30
    ) {

      synchronization += 2
      evolution += 2

      streams.push(
        'Financial perfection sustained'
      )
    }

    if (
      lowStock.length > 0
    ) {

      foresight += 2
      intelligence += 2

      streams.push(
        'Inventory collapse prevented before manifestation'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      synchronization += 2
      supremacy += 2

      streams.push(
        'Operational overload transcended'
      )
    }

    if (
      activeTables.length > 15
    ) {

      omniscience += 2
      evolution += 3

      streams.push(
        'Enterprise scale transcended'
      )
    }

    const total =
      (
        omniscience +
        supremacy +
        foresight +
        synchronization +
        evolution +
        intelligence
      ) / 6

    let state =
      'TRANSCENDENCE'

    if (
      total >= 106
    ) {

      state =
        'ABSOLUTE TRANSCENDENCE'

    } else if (
      total >= 104
    ) {

      state =
        'BEYOND ENTERPRISE'
    }

    if (
      streams.length === 0
    ) {

      streams.push(
        'Transcendence engine observing infinite enterprise reality'
      )
    }

    setTranscendence({

      omniscience:
        Math.round(
          omniscience
        ),

      supremacy:
        Math.round(
          supremacy
        ),

      foresight:
        Math.round(
          foresight
        ),

      synchronization:
        Math.round(
          synchronization
        ),

      evolution:
        Math.round(
          evolution
        ),

      intelligence:
        Math.round(
          intelligence
        ),

      state,

      streams,
    })
  }

  function color(
    value
  ) {

    if (value >= 104) {
      return 'text-emerald-400'
    }

    if (value >= 100) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Transcendence Engine"
      subtitle="Beyond enterprise intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Transcendence State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  transcendence.intelligence
                )
              }`}>

                {
                  transcendence.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                transcendence.intelligence
              )
            }`}>

              {
                transcendence.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Omniscience"
            value={transcendence.omniscience}
            color={color}
          />

          <Metric
            label="Supremacy"
            value={transcendence.supremacy}
            color={color}
          />

          <Metric
            label="Foresight"
            value={transcendence.foresight}
            color={color}
          />

          <Metric
            label="Sync"
            value={transcendence.synchronization}
            color={color}
          />

          <Metric
            label="Evolution"
            value={transcendence.evolution}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={transcendence.intelligence}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Transcendence Streams
          </div>

          <div className="space-y-4">

            {transcendence.streams.map(
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
