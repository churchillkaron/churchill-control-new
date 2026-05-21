"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function ForecastingOverviewPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    data,
    setData,
  ] = useState(null)

  useEffect(() => {

    loadTenant()

  }, [])

  useEffect(() => {

    if (tenantId) {
      loadForecast()
    }

  }, [tenantId])

  async function loadTenant() {

    const {
      data: auth,
    } = await supabase.auth.getUser()

    const user =
      auth?.user

    if (!user) return

    const {
      data,
    } = await supabase
      .from('staff_accounts')
      .select('tenant_id')
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

  async function loadForecast() {

    try {

      setLoading(true)

      const response =
        await fetch(
          `/api/forecasting/overview?tenantId=${tenantId}`
        )

      const json =
        await response.json()

      setData(json)

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  function stateColor(state) {

    if (state === 'HIGH GROWTH') {
      return 'text-emerald-400'
    }

    if (state === 'STABLE') {
      return 'text-blue-400'
    }

    return 'text-red-400'
  }

  if (loading) {

    return (

      <PageWrapper
        title="Forecasting Overview"
        subtitle="Loading predictive intelligence"
      >

        <div className="p-10 text-zinc-400">
          Loading...
        </div>

      </PageWrapper>

    )
  }

  const forecast =
    data?.forecast

  return (

    <PageWrapper
      title="Forecasting Overview"
      subtitle="Predictive financial intelligence"
    >

      <div className="p-6 text-white space-y-6">

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-3">
                Forecast State
              </div>

              <div className={`text-6xl font-light ${
                stateColor(
                  forecast?.growthState
                )
              }`}>

                {
                  forecast?.growthState
                }

              </div>

            </div>

            <div className={`text-5xl font-light ${
              stateColor(
                forecast?.growthState
              )
            }`}>

              {
                forecast?.projectedProfit?.toLocaleString()
              } ฿

            </div>

          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">

          <Metric
            label="Average Revenue"
            value={`${forecast?.averageRevenue?.toLocaleString()} ฿`}
          />

          <Metric
            label="Projected Revenue"
            value={`${forecast?.projectedRevenue?.toLocaleString()} ฿`}
          />

          <Metric
            label="Projected Cost"
            value={`${forecast?.projectedCost?.toLocaleString()} ฿`}
          />

          <Metric
            label="Projected Payroll"
            value={`${forecast?.projectedPayroll?.toLocaleString()} ฿`}
          />

        </div>

      </div>

    </PageWrapper>

  )
}

function Metric({
  label,
  value,
}) {

  return (

    <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">

      <div className="text-sm text-zinc-500 mb-3">
        {label}
      </div>

      <div className="text-4xl font-light">
        {value}
      </div>

    </div>

  )
}
