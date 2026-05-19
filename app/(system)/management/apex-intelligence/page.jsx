'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function ApexIntelligencePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    apex,
    setApex,
  ] = useState({

    supremacy: 0,

    foresight: 0,

    expansion: 0,

    resilience: 0,

    governance: 0,

    intelligence: 0,

    state: 'ASCENDING',

    directives: [],
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

    let supremacy = 99
    let foresight = 98
    let expansion = 97
    let resilience = 96
    let governance = 95
    let intelligence = 100

    const directives =
      []

    if (
      revenue > 100000
    ) {

      supremacy += 2
      expansion += 3

      directives.push(
        'Enterprise growth trajectory secured'
      )
    }

    if (
      foodCost < 30
    ) {

      governance += 4
      resilience += 3

      directives.push(
        'Financial dominance stabilized'
      )
    }

    if (
      lowStock.length > 0
    ) {

      foresight += 3
      intelligence += 2

      directives.push(
        'Inventory disruption prevented'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      resilience += 3
      governance += 2

      directives.push(
        'Operational stress absorbed'
      )
    }

    if (
      activeTables.length > 15
    ) {

      supremacy += 3
      expansion += 4

      directives.push(
        'High-volume enterprise scaling active'
      )
    }

    const total =
      (
        supremacy +
        foresight +
        expansion +
        resilience +
        governance +
        intelligence
      ) / 6

    let state =
      'APEX CONTROL'

    if (
      total >= 102
    ) {

      state =
        'ABSOLUTE ASCENSION'

    } else if (
      total >= 100
    ) {

      state =
        'GLOBAL SUPREMACY'
    }

    if (
      directives.length === 0
    ) {

      directives.push(
        'Apex intelligence monitoring enterprise reality'
      )
    }

    setApex({

      supremacy:
        Math.round(
          supremacy
        ),

      foresight:
        Math.round(
          foresight
        ),

      expansion:
        Math.round(
          expansion
        ),

      resilience:
        Math.round(
          resilience
        ),

      governance:
        Math.round(
          governance
        ),

      intelligence:
        Math.round(
          intelligence
        ),

      state,

      directives,
    })
  }

  function color(
    value
  ) {

    if (value >= 100) {
      return 'text-emerald-400'
    }

    if (value >= 95) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Apex Intelligence"
      subtitle="Supreme enterprise intelligence layer"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Apex State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  apex.intelligence
                )
              }`}>

                {
                  apex.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                apex.intelligence
              )
            }`}>

              {
                apex.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Supremacy"
            value={apex.supremacy}
            color={color}
          />

          <Metric
            label="Foresight"
            value={apex.foresight}
            color={color}
          />

          <Metric
            label="Expansion"
            value={apex.expansion}
            color={color}
          />

          <Metric
            label="Resilience"
            value={apex.resilience}
            color={color}
          />

          <Metric
            label="Governance"
            value={apex.governance}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={apex.intelligence}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Apex Directives
          </div>

          <div className="space-y-4">

            {apex.directives.map(
              (
                directive,
                index
              ) => (

                <div
                  key={index}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 text-lg"
                >

                  {
                    directive
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
