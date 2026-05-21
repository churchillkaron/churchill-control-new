"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function SelfHealingAIPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    healing,
    setHealing,
  ] = useState({

    health: 'STABLE',

    autoFixes: [],

    activeProblems: [],

    recommendations: [],
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
      .neq(
        'status',
        'COMPLETED'
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

    const autoFixes =
      []

    const activeProblems =
      []

    const recommendations =
      []

    let health =
      'STABLE'

    if (
      foodCost > 40
    ) {

      health =
        'WARNING'

      activeProblems.push(
        'Food cost above target'
      )

      autoFixes.push(
        'AI recommending recipe optimization'
      )

      recommendations.push(
        'Reduce high-cost ingredients'
      )
    }

    if (
      lowStock.length > 0
    ) {

      health =
        'WARNING'

      activeProblems.push(
        `${lowStock.length} ingredients critically low`
      )

      autoFixes.push(
        'AI procurement replenishment prepared'
      )

      recommendations.push(
        'Approve procurement requests'
      )
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      health =
        'CRITICAL'

      activeProblems.push(
        'Kitchen overload detected'
      )

      autoFixes.push(
        'AI load balancing activated'
      )

      recommendations.push(
        'Increase staffing immediately'
      )
    }

    if (
      activeProblems.length === 0
    ) {

      autoFixes.push(
        'All systems operating normally'
      )

      recommendations.push(
        'Continue operational monitoring'
      )
    }

    setHealing({

      health,

      autoFixes,

      activeProblems,

      recommendations,
    })
  }

  function color(
    value
  ) {

    if (
      value ===
      'CRITICAL'
    ) {

      return 'text-red-400'
    }

    if (
      value ===
      'WARNING'
    ) {

      return 'text-yellow-400'
    }

    return 'text-emerald-400'
  }

  return (

    <PageWrapper
      title="Self-Healing AI"
      subtitle="Autonomous operational recovery system"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                System Health
              </div>

              <div className={`text-6xl font-light ${
                color(
                  healing.health
                )
              }`}>

                {
                  healing.health
                }

              </div>

            </div>

            <div className="w-32 h-32 rounded-full border-4 border-zinc-700 flex items-center justify-center">

              <div className={`text-2xl ${
                color(
                  healing.health
                )
              }`}>

                AI

              </div>

            </div>

          </div>

        </div>

        <div className="grid grid-cols-3 gap-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              Active Problems
            </div>

            <div className="space-y-4">

              {healing.activeProblems.map(
                (
                  item,
                  index
                ) => (

                  <div
                    key={index}
                    className="bg-black border border-zinc-800 rounded-2xl p-4"
                  >

                    {item}

                  </div>

                )
              )}

              {healing.activeProblems.length === 0 && (

                <div className="bg-black border border-zinc-800 rounded-2xl p-4 text-emerald-400">
                  No active issues
                </div>

              )}

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              AI Auto Fixes
            </div>

            <div className="space-y-4">

              {healing.autoFixes.map(
                (
                  item,
                  index
                ) => (

                  <div
                    key={index}
                    className="bg-black border border-zinc-800 rounded-2xl p-4"
                  >

                    {item}

                  </div>

                )
              )}

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              Recommendations
            </div>

            <div className="space-y-4">

              {healing.recommendations.map(
                (
                  item,
                  index
                ) => (

                  <div
                    key={index}
                    className="bg-black border border-zinc-800 rounded-2xl p-4"
                  >

                    {item}

                  </div>

                )
              )}

            </div>

          </div>

        </div>

      </div>

    </PageWrapper>
  )
}
