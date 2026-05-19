'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function AlphaProtocolPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    alpha,
    setAlpha,
  ] = useState({

    dominance: 0,

    expansion: 0,

    control: 0,

    prediction: 0,

    resilience: 0,

    intelligence: 0,

    state: 'INITIALIZING',

    protocols: [],
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

    let dominance = 97
    let expansion = 95
    let control = 98
    let prediction = 96
    let resilience = 94
    let intelligence = 99

    const protocols =
      []

    if (
      revenue > 100000
    ) {

      dominance += 3
      expansion += 4

      protocols.push(
        'Enterprise expansion acceleration active'
      )
    }

    if (
      foodCost < 30
    ) {

      control += 4
      resilience += 5

      protocols.push(
        'Financial efficiency dominance stabilized'
      )
    }

    if (
      lowStock.length > 0
    ) {

      prediction += 4
      intelligence += 3

      protocols.push(
        'Inventory threat neutralization active'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      resilience += 4
      control += 3

      protocols.push(
        'Operational overload containment successful'
      )
    }

    if (
      activeTables.length > 15
    ) {

      dominance += 4
      expansion += 5

      protocols.push(
        'High-volume expansion stabilized'
      )
    }

    const total =
      (
        dominance +
        expansion +
        control +
        prediction +
        resilience +
        intelligence
      ) / 6

    let state =
      'ALPHA CONTROL'

    if (
      total >= 100
    ) {

      state =
        'ABSOLUTE DOMINION'

    } else if (
      total >= 98
    ) {

      state =
        'GLOBAL EXPANSION'
    }

    if (
      protocols.length === 0
    ) {

      protocols.push(
        'Alpha protocol monitoring enterprise dominance'
      )
    }

    setAlpha({

      dominance:
        Math.round(
          dominance
        ),

      expansion:
        Math.round(
          expansion
        ),

      control:
        Math.round(
          control
        ),

      prediction:
        Math.round(
          prediction
        ),

      resilience:
        Math.round(
          resilience
        ),

      intelligence:
        Math.round(
          intelligence
        ),

      state,

      protocols,
    })
  }

  function color(
    value
  ) {

    if (value >= 99) {
      return 'text-emerald-400'
    }

    if (value >= 94) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Alpha Protocol"
      subtitle="Enterprise dominance and expansion intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Alpha State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  alpha.intelligence
                )
              }`}>

                {
                  alpha.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                alpha.intelligence
              )
            }`}>

              {
                alpha.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Dominance"
            value={alpha.dominance}
            color={color}
          />

          <Metric
            label="Expansion"
            value={alpha.expansion}
            color={color}
          />

          <Metric
            label="Control"
            value={alpha.control}
            color={color}
          />

          <Metric
            label="Prediction"
            value={alpha.prediction}
            color={color}
          />

          <Metric
            label="Resilience"
            value={alpha.resilience}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={alpha.intelligence}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Alpha Protocols
          </div>

          <div className="space-y-4">

            {alpha.protocols.map(
              (
                protocol,
                index
              ) => (

                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 text-lg"
                >

                  {
                    protocol
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
