'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function WorldModelPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    world,
    setWorld,
  ] = useState({

    economicState: 0,

    operationalState: 0,

    customerState: 0,

    inventoryState: 0,

    predictiveState: 0,

    intelligenceState: 0,

    worldStatus: 'MAPPING',

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

    let economicState = 88
    let operationalState = 84
    let customerState = 82
    let inventoryState = 80
    let predictiveState = 90
    let intelligenceState = 92

    const signals =
      []

    if (
      revenue > 100000
    ) {

      economicState += 5
      predictiveState += 4

      signals.push(
        'Economic expansion trajectory detected'
      )
    }

    if (
      foodCost < 30
    ) {

      operationalState += 6
      intelligenceState += 4

      signals.push(
        'Operational efficiency stabilized'
      )
    }

    if (
      lowStock.length > 0
    ) {

      inventoryState -= 10
      predictiveState += 6

      signals.push(
        'Inventory uncertainty mapped'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      operationalState -= 5
      intelligenceState += 5

      signals.push(
        'High load adaptation active'
      )
    }

    if (
      activeTables.length > 15
    ) {

      customerState += 7
      economicState += 3

      signals.push(
        'Customer demand acceleration detected'
      )
    }

    const total =
      (
        economicState +
        operationalState +
        customerState +
        inventoryState +
        predictiveState +
        intelligenceState
      ) / 6

    let worldStatus =
      'WORLD STABLE'

    if (
      total >= 96
    ) {

      worldStatus =
        'WORLD SYNCHRONIZED'

    } else if (
      total >= 90
    ) {

      worldStatus =
        'WORLD OPTIMIZED'

    } else if (
      total < 75
    ) {

      worldStatus =
        'WORLD VOLATILE'
    }

    if (
      signals.length === 0
    ) {

      signals.push(
        'World model monitoring operational universe'
      )
    }

    setWorld({

      economicState:
        Math.round(
          economicState
        ),

      operationalState:
        Math.round(
          operationalState
        ),

      customerState:
        Math.round(
          customerState
        ),

      inventoryState:
        Math.round(
          inventoryState
        ),

      predictiveState:
        Math.round(
          predictiveState
        ),

      intelligenceState:
        Math.round(
          intelligenceState
        ),

      worldStatus,

      signals,
    })
  }

  function color(
    value
  ) {

    if (value >= 92) {
      return 'text-emerald-400'
    }

    if (value >= 82) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="World Model"
      subtitle="Enterprise world-state intelligence engine"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                World Status
              </div>

              <div className={`text-6xl font-light ${
                color(
                  world.intelligenceState
                )
              }`}>

                {
                  world.worldStatus
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                world.intelligenceState
              )
            }`}>

              {
                world.intelligenceState
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Economic"
            value={world.economicState}
            color={color}
          />

          <Metric
            label="Operations"
            value={world.operationalState}
            color={color}
          />

          <Metric
            label="Customer"
            value={world.customerState}
            color={color}
          />

          <Metric
            label="Inventory"
            value={world.inventoryState}
            color={color}
          />

          <Metric
            label="Predictive"
            value={world.predictiveState}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={world.intelligenceState}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            World Signals
          </div>

          <div className="space-y-4">

            {world.signals.map(
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
