'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function ExecutiveCorePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    executive,
    setExecutive,
  ] = useState({

    enterpriseValue: 0,

    operationalStrength: 0,

    financialStrength: 0,

    intelligenceStrength: 0,

    scalability: 0,

    survivability: 0,

    executiveState: 'ANALYZING',

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

    let enterpriseValue = 88
    let operationalStrength = 84
    let financialStrength = 86
    let intelligenceStrength = 90
    let scalability = 82
    let survivability = 89

    const directives =
      []

    if (
      revenue > 100000
    ) {

      enterpriseValue += 6
      scalability += 5

      directives.push(
        'Enterprise expansion capacity increased'
      )
    }

    if (
      foodCost < 30
    ) {

      financialStrength += 8
      survivability += 4

      directives.push(
        'Financial efficiency stabilized'
      )
    }

    if (
      lowStock.length > 0
    ) {

      operationalStrength -= 8
      intelligenceStrength += 5

      directives.push(
        'Inventory instability mitigation active'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      operationalStrength -= 5
      intelligenceStrength += 4

      directives.push(
        'Operational balancing system active'
      )
    }

    if (
      activeTables.length > 15
    ) {

      scalability += 8
      enterpriseValue += 4

      directives.push(
        'High customer flow scaling successful'
      )
    }

    const total =
      (
        enterpriseValue +
        operationalStrength +
        financialStrength +
        intelligenceStrength +
        scalability +
        survivability
      ) / 6

    let executiveState =
      'EXECUTIVE STABLE'

    if (
      total >= 96
    ) {

      executiveState =
        'GLOBAL EXECUTIVE CONTROL'

    } else if (
      total >= 90
    ) {

      executiveState =
        'EXECUTIVE OPTIMIZED'

    } else if (
      total < 75
    ) {

      executiveState =
        'EXECUTIVE WARNING'
    }

    if (
      directives.length === 0
    ) {

      directives.push(
        'Executive core monitoring enterprise ecosystem'
      )
    }

    setExecutive({

      enterpriseValue:
        Math.round(
          enterpriseValue
        ),

      operationalStrength:
        Math.round(
          operationalStrength
        ),

      financialStrength:
        Math.round(
          financialStrength
        ),

      intelligenceStrength:
        Math.round(
          intelligenceStrength
        ),

      scalability:
        Math.round(
          scalability
        ),

      survivability:
        Math.round(
          survivability
        ),

      executiveState,

      directives,
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
      title="Executive Core"
      subtitle="Enterprise command and intelligence layer"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Executive State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  executive.intelligenceStrength
                )
              }`}>

                {
                  executive.executiveState
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                executive.intelligenceStrength
              )
            }`}>

              {
                executive.intelligenceStrength
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Enterprise"
            value={executive.enterpriseValue}
            color={color}
          />

          <Metric
            label="Operations"
            value={executive.operationalStrength}
            color={color}
          />

          <Metric
            label="Finance"
            value={executive.financialStrength}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={executive.intelligenceStrength}
            color={color}
          />

          <Metric
            label="Scalability"
            value={executive.scalability}
            color={color}
          />

          <Metric
            label="Survival"
            value={executive.survivability}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Executive Directives
          </div>

          <div className="space-y-4">

            {executive.directives.map(
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
