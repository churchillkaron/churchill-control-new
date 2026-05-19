'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function SovereignAIPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    sovereign,
    setSovereign,
  ] = useState({

    sovereignty: 0,

    governance: 0,

    control: 0,

    resilience: 0,

    scalability: 0,

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

    let sovereignty = 90
    let governance = 88
    let control = 92
    let resilience = 86
    let scalability = 84
    let intelligence = 94

    const protocols =
      []

    if (
      revenue > 100000
    ) {

      sovereignty += 5
      scalability += 6

      protocols.push(
        'Enterprise expansion governance active'
      )
    }

    if (
      foodCost < 30
    ) {

      governance += 5
      resilience += 5

      protocols.push(
        'Financial governance stabilized'
      )
    }

    if (
      lowStock.length > 0
    ) {

      control -= 8
      intelligence += 5

      protocols.push(
        'Inventory containment protocols active'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      control -= 5
      resilience += 4

      protocols.push(
        'Operational overload mitigation active'
      )
    }

    if (
      activeTables.length > 15
    ) {

      scalability += 8
      sovereignty += 4

      protocols.push(
        'High-volume scaling governance active'
      )
    }

    const total =
      (
        sovereignty +
        governance +
        control +
        resilience +
        scalability +
        intelligence
      ) / 6

    let state =
      'SOVEREIGN STABLE'

    if (
      total >= 98
    ) {

      state =
        'SOVEREIGN ASCENSION'

    } else if (
      total >= 92
    ) {

      state =
        'ABSOLUTE CONTROL'

    } else if (
      total < 80
    ) {

      state =
        'SOVEREIGN WARNING'
    }

    if (
      protocols.length === 0
    ) {

      protocols.push(
        'Sovereign AI monitoring enterprise sovereignty'
      )
    }

    setSovereign({

      sovereignty:
        Math.round(
          sovereignty
        ),

      governance:
        Math.round(
          governance
        ),

      control:
        Math.round(
          control
        ),

      resilience:
        Math.round(
          resilience
        ),

      scalability:
        Math.round(
          scalability
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

    if (value >= 94) {
      return 'text-emerald-400'
    }

    if (value >= 84) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Sovereign AI"
      subtitle="Enterprise sovereignty and governance intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Sovereign State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  sovereign.intelligence
                )
              }`}>

                {
                  sovereign.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                sovereign.intelligence
              )
            }`}>

              {
                sovereign.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Sovereignty"
            value={sovereign.sovereignty}
            color={color}
          />

          <Metric
            label="Governance"
            value={sovereign.governance}
            color={color}
          />

          <Metric
            label="Control"
            value={sovereign.control}
            color={color}
          />

          <Metric
            label="Resilience"
            value={sovereign.resilience}
            color={color}
          />

          <Metric
            label="Scalability"
            value={sovereign.scalability}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={sovereign.intelligence}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Sovereign Protocols
          </div>

          <div className="space-y-4">

            {sovereign.protocols.map(
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
