"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function CentralNervousSystemPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    system,
    setSystem,
  ] = useState({

    neuralLoad: 0,

    operationalPulse: 0,

    financialPulse: 0,

    automationPulse: 0,

    survivalIndex: 0,

    synchronization: 0,

    state: 'BOOTING',

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

    let neuralLoad = 70
    let operationalPulse = 80
    let financialPulse = 78
    let automationPulse = 75
    let survivalIndex = 82
    let synchronization = 85

    const signals =
      []

    if (
      revenue > 100000
    ) {

      neuralLoad += 5
      operationalPulse += 5

      signals.push(
        'Revenue growth signal detected'
      )
    }

    if (
      foodCost > 40
    ) {

      financialPulse -= 25
      survivalIndex -= 15

      signals.push(
        'Financial instability signal active'
      )
    }

    if (
      lowStock.length > 0
    ) {

      synchronization -= 10
      operationalPulse -= 5

      signals.push(
        'Inventory desynchronization detected'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      neuralLoad += 10
      automationPulse += 5

      signals.push(
        'Kitchen overload compensation active'
      )
    }

    const total =
      (
        neuralLoad +
        operationalPulse +
        financialPulse +
        automationPulse +
        survivalIndex +
        synchronization
      ) / 6

    let state =
      'STABLE'

    if (
      total >= 90
    ) {

      state =
        'HYPER SYNCHRONIZED'

    } else if (
      total >= 80
    ) {

      state =
        'FULLY SYNCHRONIZED'

    } else if (
      total < 60
    ) {

      state =
        'SYSTEM STRESS'
    }

    if (
      signals.length === 0
    ) {

      signals.push(
        'All operational systems synchronized'
      )
    }

    setSystem({

      neuralLoad:
        Math.round(
          neuralLoad
        ),

      operationalPulse:
        Math.round(
          operationalPulse
        ),

      financialPulse:
        Math.round(
          financialPulse
        ),

      automationPulse:
        Math.round(
          automationPulse
        ),

      survivalIndex:
        Math.round(
          survivalIndex
        ),

      synchronization:
        Math.round(
          synchronization
        ),

      state,

      signals,
    })
  }

  function color(
    value
  ) {

    if (value >= 85) {
      return 'text-emerald-400'
    }

    if (value >= 70) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Central Nervous System"
      subtitle="Enterprise synchronization intelligence"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                System State
              </div>

              <div className={`text-6xl font-light ${
                color(
                  system.synchronization
                )
              }`}>

                {
                  system.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              color(
                system.synchronization
              )
            }`}>

              {
                system.synchronization
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-6 gap-4 mb-6">

          <Metric
            label="Neural Load"
            value={system.neuralLoad}
            color={color}
          />

          <Metric
            label="Operations"
            value={system.operationalPulse}
            color={color}
          />

          <Metric
            label="Finance"
            value={system.financialPulse}
            color={color}
          />

          <Metric
            label="Automation"
            value={system.automationPulse}
            color={color}
          />

          <Metric
            label="Survival"
            value={system.survivalIndex}
            color={color}
          />

          <Metric
            label="Sync"
            value={system.synchronization}
            color={color}
          />

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Neural Signals
          </div>

          <div className="space-y-4">

            {system.signals.map(
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
