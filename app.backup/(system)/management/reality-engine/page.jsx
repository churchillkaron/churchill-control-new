"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function RealityEnginePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    reality,
    setReality,
  ] = useState({

    operationalReality: 0,

    financialReality: 0,

    inventoryReality: 0,

    customerReality: 0,

    predictiveReality: 0,

    systemReality: 0,

    state: 'SCANNING',

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

    let operationalReality = 85
    let financialReality = 86
    let inventoryReality = 82
    let customerReality = 84
    let predictiveReality = 88
    let systemReality = 90

    const streams =
      []

    if (
      revenue > 100000
    ) {

      financialReality += 6
      predictiveReality += 5

      streams.push(
        'Revenue expansion reality confirmed'
      )
    }

    if (
      foodCost < 30
    ) {

      operationalReality += 5
      financialReality += 8

      streams.push(
        'Operational efficiency stable'
      )
    }

    if (
      lowStock.length > 0
    ) {

      inventoryReality -= 10
      predictiveReality += 5

      streams.push(
        'Inventory instability detected'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      operationalReality -= 5
      systemReality += 5

      streams.push(
        'High load operational balancing active'
      )
    }

    if (
      activeTables.length > 15
    ) {

      customerReality += 6
      systemReality += 4

      streams.push(
        'High customer flow sustained'
      )
    }

    const total =
      (
        operationalReality +
        financialReality +
        inventoryReality +
        customerReality +
        predictiveReality +
        systemReality
      ) / 6

    let state =
      'REALITY STABLE'

    if (
      total >= 95
    ) {

      state =
        'REALITY SYNCHRONIZED'

    } else if (
      total >= 90
    ) {

      state =
        'REALITY OPTIMIZED'

    } else if (
      total < 75
    ) {

      state =
        'REALITY WARNING'
    }

    if (
      streams.length === 0
    ) {

      streams.push(
        'Reality engine monitoring live ecosystem'
      )
    }

    setReality({

      operationalReality:
        Math.round(
          operationalReality
        ),

      financialReality:
        Math.round(
          financialReality
        ),

      inventoryReality:
        Math.round(
          inventoryReality
        ),

      customerReality:
        Math.round(
          customerReality
        ),

      predictiveReality:
        Math.round(
          predictiveReality
        ),

      systemReality:
        Math.round(
          systemReality
        ),

      state,

      streams,
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
      title="Reality Engine"
      subtitle="Live operational reality synchronization"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Reality State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  reality.systemReality
                )
              }`}>

                {
                  reality.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                reality.systemReality
              )
            }`}>

              {
                reality.systemReality
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Operations"
            value={reality.operationalReality}
            color={color}
          />

          <Metric
            label="Finance"
            value={reality.financialReality}
            color={color}
          />

          <Metric
            label="Inventory"
            value={reality.inventoryReality}
            color={color}
          />

          <Metric
            label="Customer"
            value={reality.customerReality}
            color={color}
          />

          <Metric
            label="Predictive"
            value={reality.predictiveReality}
            color={color}
          />

          <Metric
            label="System"
            value={reality.systemReality}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Reality Streams
          </div>

          <div className="space-y-4">

            {reality.streams.map(
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
