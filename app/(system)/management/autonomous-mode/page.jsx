'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function AutonomousModePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    autonomous,
    setAutonomous,
  ] = useState({

    mode: 'ACTIVE',

    automationScore: 0,

    systemsControlled: 0,

    aiActions: [],

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

    const aiActions =
      []

    const recommendations =
      []

    let systemsControlled = 0

    const lowStock =
      (ingredients || [])
        .filter(
          i =>
            Number(
              i.quantity || 0
            ) <= 5
        )

    if (
      lowStock.length > 0
    ) {

      aiActions.push(
        'AI prepared procurement replenishment'
      )

      recommendations.push(
        'Approve auto procurement workflow'
      )

      systemsControlled++
    }

    if (
      (kitchen || [])
        .length > 10
    ) {

      aiActions.push(
        'AI balancing kitchen workload'
      )

      recommendations.push(
        'Increase prep production before peak'
      )

      systemsControlled++
    }

    let revenue = 0

    ;(sales || []).forEach(
      row => {

        revenue +=
          Number(
            row.revenue || 0
          )
      }
    )

    if (
      revenue > 100000
    ) {

      aiActions.push(
        'AI evaluating service charge upgrade'
      )

      recommendations.push(
        'Review operational incentive unlock'
      )

      systemsControlled++
    }

    if (
      aiActions.length === 0
    ) {

      aiActions.push(
        'AI monitoring operations'
      )

      recommendations.push(
        'System stable'
      )
    }

    const automationScore =
      Math.min(
        100,
        systemsControlled * 25 + 25
      )

    setAutonomous({

      mode:
        automationScore >= 75
          ? 'FULLY AUTONOMOUS'
          : automationScore >= 50
          ? 'ASSISTED AI'
          : 'MONITORING',

      automationScore,

      systemsControlled,

      aiActions,

      recommendations,
    })
  }

  function color(
    score
  ) {

    if (score >= 75) {
      return 'text-emerald-400'
    }

    if (score >= 50) {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  return (

    <PageWrapper
      title="Autonomous Mode"
      subtitle="AI autonomous restaurant operations"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-2">
                Autonomous Status
              </div>

              <div className={`text-6xl font-light ${
                color(
                  autonomous.automationScore
                )
              }`}>

                {
                  autonomous.mode
                }

              </div>

            </div>

            <div className="text-right">

              <div className="text-sm text-zinc-500 mb-2">
                Automation Score
              </div>

              <div className={`text-6xl font-light ${
                color(
                  autonomous.automationScore
                )
              }`}>

                {
                  autonomous.automationScore
                }%

              </div>

            </div>

          </div>

        </div>

        <div className="grid grid-cols-3 gap-6 mb-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-sm text-zinc-500 mb-2">
              Systems Controlled
            </div>

            <div className="text-5xl font-light">
              {
                autonomous.systemsControlled
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-sm text-zinc-500 mb-2">
              AI Actions
            </div>

            <div className="text-5xl font-light">
              {
                autonomous.aiActions.length
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-sm text-zinc-500 mb-2">
              Recommendations
            </div>

            <div className="text-5xl font-light">
              {
                autonomous.recommendations.length
              }
            </div>

          </div>

        </div>

        <div className="grid grid-cols-2 gap-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              AI Actions
            </div>

            <div className="space-y-4">

              {autonomous.aiActions.map(
                (
                  action,
                  index
                ) => (

                  <div
                    key={index}
                    className="bg-black border border-zinc-800 rounded-2xl p-4"
                  >

                    {
                      action
                    }

                  </div>

                )
              )}

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              AI Recommendations
            </div>

            <div className="space-y-4">

              {autonomous.recommendations.map(
                (
                  item,
                  index
                ) => (

                  <div
                    key={index}
                    className="bg-black border border-zinc-800 rounded-2xl p-4"
                  >

                    {
                      item
                    }

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
