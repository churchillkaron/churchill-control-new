'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function HiveMindPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    hive,
    setHive,
  ] = useState({

    collectiveIQ: 0,

    synchronization: 0,

    coordination: 0,

    resilience: 0,

    adaptation: 0,

    intelligence: 0,

    hiveState: 'INITIALIZING',

    signals: [],
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

    let collectiveIQ = 80
    let synchronization = 82
    let coordination = 78
    let resilience = 76
    let adaptation = 74
    let intelligence = 81

    const signals =
      []

    if (
      revenue > 100000
    ) {

      collectiveIQ += 5
      intelligence += 5

      signals.push(
        'Revenue expansion network active'
      )
    }

    if (
      foodCost < 30
    ) {

      coordination += 8
      synchronization += 5

      signals.push(
        'Financial optimization stable'
      )
    }

    if (
      lowStock.length > 0
    ) {

      resilience += 6
      adaptation += 8

      signals.push(
        'Inventory adaptation protocol active'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      coordination += 10
      intelligence += 4

      signals.push(
        'Operational balancing swarm activated'
      )
    }

    if (
      activeTables.length > 15
    ) {

      synchronization += 8

      signals.push(
        'High load coordination successful'
      )
    }

    const total =
      (
        collectiveIQ +
        synchronization +
        coordination +
        resilience +
        adaptation +
        intelligence
      ) / 6

    let hiveState =
      'LEARNING'

    if (
      total >= 90
    ) {

      hiveState =
        'HIVE ASCENDED'

    } else if (
      total >= 82
    ) {

      hiveState =
        'COLLECTIVE INTELLIGENCE'

    } else if (
      total >= 72
    ) {

      hiveState =
        'SYNCHRONIZED'
    }

    if (
      signals.length === 0
    ) {

      signals.push(
        'Hive systems monitoring environment'
      )
    }

    setHive({

      collectiveIQ:
        Math.round(
          collectiveIQ
        ),

      synchronization:
        Math.round(
          synchronization
        ),

      coordination:
        Math.round(
          coordination
        ),

      resilience:
        Math.round(
          resilience
        ),

      adaptation:
        Math.round(
          adaptation
        ),

      intelligence:
        Math.round(
          intelligence
        ),

      hiveState,

      signals,
    })
  }

  function color(
    value
  ) {

    if (value >= 90) {
      return 'text-emerald-400'
    }

    if (value >= 75) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Hive Mind"
      subtitle="Collective enterprise intelligence network"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Hive State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  hive.collectiveIQ
                )
              }`}>

                {
                  hive.hiveState
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                hive.collectiveIQ
              )
            }`}>

              {
                hive.collectiveIQ
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Collective"
            value={hive.collectiveIQ}
            color={color}
          />

          <Metric
            label="Sync"
            value={hive.synchronization}
            color={color}
          />

          <Metric
            label="Coordination"
            value={hive.coordination}
            color={color}
          />

          <Metric
            label="Resilience"
            value={hive.resilience}
            color={color}
          />

          <Metric
            label="Adaptation"
            value={hive.adaptation}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={hive.intelligence}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Hive Signals
          </div>

          <div className="space-y-4">

            {hive.signals.map(
              (
                signal,
                index
              ) => (

                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 text-lg"
                >

                  {
                    signal
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
