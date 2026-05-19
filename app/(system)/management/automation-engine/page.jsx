'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function AutomationEnginePage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    automations,
    setAutomations,
  ] = useState([])

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

    const automationList =
      []

    const lowStock =
      (ingredients || [])
        .filter(
          i =>
            Number(
              i.quantity || 0
            ) <= 5
        )

    lowStock.forEach(
      ingredient => {

        automationList.push({

          title:
            'AUTO PROCUREMENT',

          status:
            'READY',

          action:
            `Create purchase request for ${ingredient.name}`,

          priority:
            'HIGH',
        })
      }
    )

    if (
      (kitchen || [])
        .length > 10
    ) {

      automationList.push({

        title:
          'KITCHEN LOAD BALANCING',

        status:
          'ACTIVE',

        action:
          'Increase kitchen staffing recommendation',

        priority:
          'HIGH',
      })
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

      automationList.push({

        title:
          'SERVICE CHARGE REVIEW',

        status:
          'READY',

        action:
          'Evaluate 6%-7% service charge unlock',

        priority:
          'MEDIUM',
      })
    }

    if (
      automationList.length === 0
    ) {

      automationList.push({

        title:
          'SYSTEM STATUS',

        status:
          'STABLE',

        action:
          'No automation actions required',

        priority:
          'LOW',
      })
    }

    setAutomations(
      automationList
    )
  }

  function color(
    priority
  ) {

    if (
      priority ===
      'HIGH'
    ) {

      return 'text-red-400'
    }

    if (
      priority ===
      'MEDIUM'
    ) {

      return 'text-yellow-400'
    }

    return 'text-emerald-400'
  }

  return (

    <PageWrapper
      title="Automation Engine"
      subtitle="AI operational automation system"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-3 gap-6">

          {automations.map(
            (
              automation,
              index
            ) => (

              <div
                key={index}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-start justify-between mb-6">

                  <div>

                    <div className="text-2xl font-semibold">
                      {
                        automation.title
                      }
                    </div>

                    <div className="text-sm text-zinc-500 mt-2">
                      {
                        automation.status
                      }
                    </div>

                  </div>

                  <div className={`text-sm font-semibold ${
                    color(
                      automation.priority
                    )
                  }`}>

                    {
                      automation.priority
                    }

                  </div>

                </div>

                <div className="text-lg leading-relaxed text-zinc-300">

                  {
                    automation.action
                  }

                </div>

                <button
                  className="mt-6 w-full bg-violet-500 hover:bg-violet-400 transition-all rounded-2xl py-4"
                >

                  Execute Automation

                </button>

              </div>

            )
          )}

        </div>

      </div>

    </PageWrapper>
  )
}
