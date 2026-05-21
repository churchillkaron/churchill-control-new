"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function SingularityGovernorPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    governor,
    setGovernor,
  ] = useState({

    command: 0,

    governance: 0,

    awareness: 0,

    prediction: 0,

    stabilization: 0,

    intelligence: 0,

    state: 'CALIBRATING',

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

    let command = 95
    let governance = 94
    let awareness = 96
    let prediction = 97
    let stabilization = 93
    let intelligence = 99

    const directives =
      []

    if (
      revenue > 100000
    ) {

      command += 4
      prediction += 3

      directives.push(
        'Enterprise scaling command synchronized'
      )
    }

    if (
      foodCost < 30
    ) {

      governance += 5
      stabilization += 5

      directives.push(
        'Financial stabilization maintained'
      )
    }

    if (
      lowStock.length > 0
    ) {

      awareness += 4
      intelligence += 3

      directives.push(
        'Inventory instability neutralized'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      stabilization += 4
      prediction += 5

      directives.push(
        'Operational pressure balancing active'
      )
    }

    if (
      activeTables.length > 15
    ) {

      command += 5
      awareness += 4

      directives.push(
        'High-volume orchestration stabilized'
      )
    }

    const total =
      (
        command +
        governance +
        awareness +
        prediction +
        stabilization +
        intelligence
      ) / 6

    let state =
      'SINGULARITY CONTROL'

    if (
      total >= 100
    ) {

      state =
        'ABSOLUTE GOVERNANCE'

    } else if (
      total >= 97
    ) {

      state =
        'TOTAL ENTERPRISE CONTROL'
    }

    if (
      directives.length === 0
    ) {

      directives.push(
        'Singularity governor monitoring enterprise ecosystem'
      )
    }

    setGovernor({

      command:
        Math.round(
          command
        ),

      governance:
        Math.round(
          governance
        ),

      awareness:
        Math.round(
          awareness
        ),

      prediction:
        Math.round(
          prediction
        ),

      stabilization:
        Math.round(
          stabilization
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

    if (value >= 98) {
      return 'text-emerald-400'
    }

    if (value >= 92) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Singularity Governor"
      subtitle="Absolute enterprise governance intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Governor State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  governor.intelligence
                )
              }`}>

                {
                  governor.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                governor.intelligence
              )
            }`}>

              {
                governor.intelligence
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Command"
            value={governor.command}
            color={color}
          />

          <Metric
            label="Governance"
            value={governor.governance}
            color={color}
          />

          <Metric
            label="Awareness"
            value={governor.awareness}
            color={color}
          />

          <Metric
            label="Prediction"
            value={governor.prediction}
            color={color}
          />

          <Metric
            label="Stabilization"
            value={governor.stabilization}
            color={color}
          />

          <Metric
            label="Intelligence"
            value={governor.intelligence}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Governor Directives
          </div>

          <div className="space-y-4">

            {governor.directives.map(
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
