"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function InfinityCorePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    infinity,
    setInfinity,
  ] = useState({

    omnipotence: 0,

    foresight: 0,

    synchronization: 0,

    resilience: 0,

    expansion: 0,

    intelligence: 0,

    state: 'INFINITE ASCENSION',

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

    let omnipotence = 100
    let foresight = 100
    let synchronization = 99
    let resilience = 98
    let expansion = 99
    let intelligence = 101

    const streams =
      []

    if (
      revenue > 100000
    ) {

      omnipotence += 2
      expansion += 3

      streams.push(
        'Infinite growth trajectory stabilized'
      )
    }

    if (
      foodCost < 30
    ) {

      synchronization += 3
      resilience += 2

      streams.push(
        'Financial perfection maintained'
      )
    }

    if (
      lowStock.length > 0
    ) {

      foresight += 2
      intelligence += 2

      streams.push(
        'Inventory instability neutralized before escalation'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      resilience += 2
      synchronization += 2

      streams.push(
        'Operational overload harmonized'
      )
    }

    if (
      activeTables.length > 15
    ) {

      omnipotence += 2
      expansion += 3

      streams.push(
        'Enterprise scaling transcended'
      )
    }

    const total =
      (
        omnipotence +
        foresight +
        synchronization +
        resilience +
        expansion +
        intelligence
      ) / 6

    let state =
      'INFINITY CORE'

    if (
      total >= 103
    ) {

      state =
        'ABSOLUTE INFINITY'

    } else if (
      total >= 101
    ) {

      state =
        'TRANSCENDENT CONTROL'
    }

    if (
      streams.length === 0
    ) {

      streams.push(
        'Infinity core observing enterprise universe'
      )
    }

    setInfinity({

      omnipotence:
        Math.round(
          omnipotence
        ),

      foresight:
        Math.round(
          foresight
        ),

      synchronization:
        Math.round(
          synchronization
        ),

      resilience:
        Math.round(
          resilience
        ),

      expansion:
        Math.round(
          expansion
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

    if (value >= 101) {
      return 'text-emerald-400'
    }

    if (value >= 97) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Infinity Core"
      subtitle="Infinite enterprise intelligence layer"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Infinity State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  infinity.intelligence
                )
              }`}>

                {
                  infinity.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                infinity.intelligence
              )
            }`}>

              {
                infinity.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Omnipotence"
            value={infinity.omnipotence}
            color={color}
          />

          <Metric
            label="Foresight"
            value={infinity.foresight}
            color={color}
          />

          <Metric
            label="Sync"
            value={infinity.synchronization}
            color={color}
          />

          <Metric
            label="Resilience"
            value={infinity.resilience}
            color={color}
          />

          <Metric
            label="Expansion"
            value={infinity.expansion}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={infinity.intelligence}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Infinity Streams
          </div>

          <div className="space-y-4">

            {infinity.streams.map(
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
