'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function PredictiveAIPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    prediction,
    setPrediction,
  ] = useState({

    tomorrowRevenue: 0,

    expectedOrders: 0,

    inventoryRisk: 'LOW',

    kitchenPressure: 'NORMAL',

    staffingPressure: 'NORMAL',

    recommendation: '',

    alerts: [],
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

    const rows =
      sales || []

    let revenue = 0
    let orders = 0

    rows.forEach(row => {

      revenue +=
        Number(
          row.revenue || 0
        )

      orders +=
        Number(
          row.quantity || 0
        )
    })

    const avgRevenue =
      revenue > 0
        ? revenue
        : 0

    const tomorrowRevenue =
      avgRevenue * 1.08

    const expectedOrders =
      Math.ceil(
        orders * 1.05
      )

    const lowStock =
      (ingredients || [])
        .filter(
          i =>
            Number(
              i.quantity || 0
            ) <= 5
        )

    let inventoryRisk =
      'LOW'

    let kitchenPressure =
      'NORMAL'

    let staffingPressure =
      'NORMAL'

    const alerts =
      []

    if (
      lowStock.length >= 5
    ) {

      inventoryRisk =
        'HIGH'

      alerts.push(
        'Inventory shortage predicted tomorrow'
      )
    }

    if (
      expectedOrders >= 150
    ) {

      kitchenPressure =
        'HIGH'

      staffingPressure =
        'HIGH'

      alerts.push(
        'High kitchen load predicted'
      )
    }

    let recommendation =
      'Operations forecast stable.'

    if (
      inventoryRisk ===
      'HIGH'
    ) {

      recommendation =
        'Urgent replenishment required before next service.'
    }

    if (
      kitchenPressure ===
      'HIGH'
    ) {

      recommendation =
        'Increase staffing and prep production before peak.'
    }

    setPrediction({

      tomorrowRevenue,

      expectedOrders,

      inventoryRisk,

      kitchenPressure,

      staffingPressure,

      recommendation,

      alerts,
    })
  }

  function color(
    value
  ) {

    if (
      value ===
      'HIGH'
    ) {

      return 'text-red-400'
    }

    if (
      value ===
      'NORMAL'
    ) {

      return 'text-yellow-400'
    }

    return 'text-emerald-400'
  }

  return (

    <PageWrapper
      title="Predictive AI"
      subtitle="Forecasting and operational prediction engine"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-5 gap-4 mb-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Tomorrow Revenue
            </div>

            <div className="text-3xl font-light">
              ฿
              {
                prediction.tomorrowRevenue.toFixed(0)
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Expected Orders
            </div>

            <div className="text-3xl font-light">
              {
                prediction.expectedOrders
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Inventory Risk
            </div>

            <div className={`text-3xl font-light ${
              color(
                prediction.inventoryRisk
              )
            }`}>

              {
                prediction.inventoryRisk
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Kitchen Load
            </div>

            <div className={`text-3xl font-light ${
              color(
                prediction.kitchenPressure
              )
            }`}>

              {
                prediction.kitchenPressure
              }

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Staffing
            </div>

            <div className={`text-3xl font-light ${
              color(
                prediction.staffingPressure
              )
            }`}>

              {
                prediction.staffingPressure
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-2 gap-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              AI Forecast
            </div>

            <div className="text-2xl leading-relaxed text-zinc-300">
              {
                prediction.recommendation
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              Predictive Alerts
            </div>

            <div className="space-y-4">

              {prediction.alerts.map(
                (
                  alert,
                  index
                ) => (

                  <div
                    key={index}
                    className="bg-black border border-zinc-800 rounded-2xl p-4"
                  >

                    {
                      alert
                    }

                  </div>

                )
              )}

              {prediction.alerts.length === 0 && (

                <div className="bg-black border border-zinc-800 rounded-2xl p-4 text-emerald-400">
                  No operational risks predicted
                </div>

              )}

            </div>

          </div>

        </div>

      </div>

    </PageWrapper>
  )
}
