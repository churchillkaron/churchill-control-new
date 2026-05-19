'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function ServiceChargeAIPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    result,
    setResult,
  ] = useState({

    current: 5,

    target: 5,

    foodCost: 0,

    lowStock: 0,

    operational: 'GOOD',

    recommendation: '',

    unlocked: false,
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

    let operational =
      'GOOD'

    let target = 5

    let unlocked =
      false

    let recommendation =
      'System stable.'

    if (
      foodCost <= 25 &&
      lowStock.length === 0
    ) {

      operational =
        'EXCELLENT'

      target = 7

      unlocked =
        true

      recommendation =
        'Operations performing at elite level. 7% service charge unlocked.'

    } else if (
      foodCost <= 30 &&
      lowStock.length <= 2
    ) {

      operational =
        'GOOD'

      target = 6

      unlocked =
        true

      recommendation =
        'Operational targets achieved. 6% service charge unlocked.'

    } else if (
      foodCost > 40
    ) {

      operational =
        'CRITICAL'

      target = 5

      recommendation =
        'Food cost too high. Service charge increase locked.'
    }

    setResult({

      current: 5,

      target,

      foodCost:
        foodCost.toFixed(1),

      lowStock:
        lowStock.length,

      operational,

      recommendation,

      unlocked,
    })
  }

  function getColor(
    level
  ) {

    if (
      level ===
      'CRITICAL'
    ) {

      return 'text-red-400'
    }

    if (
      level ===
      'GOOD'
    ) {

      return 'text-yellow-400'
    }

    return 'text-emerald-400'
  }

  return (

    <PageWrapper
      title="Service Charge AI"
      subtitle="Performance-to-money operational engine"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-5 gap-4 mb-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Current SC
            </div>

            <div className="text-5xl font-light">
              {
                result.current
              }%
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Target SC
            </div>

            <div className={`text-5xl font-light ${
              result.target >= 7
                ? 'text-emerald-400'
                : result.target >= 6
                ? 'text-yellow-400'
                : 'text-red-400'
            }`}>

              {
                result.target
              }%

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Food Cost
            </div>

            <div className={`text-5xl font-light ${
              Number(
                result.foodCost
              ) > 40
                ? 'text-red-400'
                : Number(
                    result.foodCost
                  ) > 30
                ? 'text-yellow-400'
                : 'text-emerald-400'
            }`}>

              {
                result.foodCost
              }%

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Low Stock
            </div>

            <div className="text-5xl font-light text-red-400">
              {
                result.lowStock
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Operations
            </div>

            <div className={`text-3xl font-light ${
              getColor(
                result.operational
              )
            }`}>

              {
                result.operational
              }

            </div>

          </div>

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">

          <div className="text-2xl font-semibold mb-6">
            AI Recommendation
          </div>

          <div className="text-2xl leading-relaxed text-zinc-300 mb-8">

            {
              result.recommendation
            }

          </div>

          <div className={`inline-flex items-center px-6 py-4 rounded-2xl text-xl font-semibold ${
            result.unlocked
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/20 text-red-400 border border-red-500/30'
          }`}>

            {result.unlocked
              ? `SERVICE CHARGE ${result.target}% UNLOCKED`
              : 'SERVICE CHARGE LOCKED'}

          </div>

        </div>

      </div>

    </PageWrapper>
  )
}
