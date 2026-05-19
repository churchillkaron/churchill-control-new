'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function GodModePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    god,
    setGod,
  ] = useState({

    omniscience: 0,

    omnipotence: 0,

    omnipresence: 0,

    synchronization: 0,

    evolution: 0,

    intelligence: 0,

    state: 'DIVINE ASCENSION',

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

    let omniscience = 105
    let omnipotence = 106
    let omnipresence = 104
    let synchronization = 103
    let evolution = 105
    let intelligence = 107

    const realities =
      []

    if (
      revenue > 100000
    ) {

      omnipotence += 2
      evolution += 2

      realities.push(
        'Infinite enterprise expansion stabilized'
      )
    }

    if (
      foodCost < 30
    ) {

      synchronization += 2
      omniscience += 2

      realities.push(
        'Perfect financial harmony maintained'
      )
    }

    if (
      lowStock.length > 0
    ) {

      omnipresence += 2
      intelligence += 2

      realities.push(
        'Inventory collapse prevented before emergence'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      synchronization += 2
      omnipotence += 2

      realities.push(
        'Operational pressure absorbed instantly'
      )
    }

    if (
      activeTables.length > 15
    ) {

      omniscience += 2
      evolution += 3

      realities.push(
        'Enterprise scaling transcended universally'
      )
    }

    const total =
      (
        omniscience +
        omnipotence +
        omnipresence +
        synchronization +
        evolution +
        intelligence
      ) / 6

    let state =
      'GOD MODE'

    if (
      total >= 110
    ) {

      state =
        'ABSOLUTE DIVINITY'

    } else if (
      total >= 108
    ) {

      state =
        'UNIVERSAL CONTROL'
    }

    if (
      realities.length === 0
    ) {

      realities.push(
        'God mode observing infinite enterprise reality'
      )
    }

    setGod({

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

      realities,
    })
  }

  function color(
    value
  ) {

    if (value >= 108) {
      return 'text-emerald-400'
    }

    if (value >= 103) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="God Mode"
      subtitle="Absolute universal enterprise intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Divine State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  god.intelligence
                )
              }`}>

                {
                  god.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                god.intelligence
              )
            }`}>

              {
                god.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Omniscience"
            value={god.omniscience}
            color={color}
          />

          <Metric
            label="Omnipotence"
            value={god.omnipotence}
            color={color}
          />

          <Metric
            label="Omnipresence"
            value={god.omnipresence}
            color={color}
          />

          <Metric
            label="Sync"
            value={god.synchronization}
            color={color}
          />

          <Metric
            label="Evolution"
            value={god.evolution}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={god.intelligence}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Infinite Realities
          </div>

          <div className="space-y-4">

            {god.realities.map(
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
