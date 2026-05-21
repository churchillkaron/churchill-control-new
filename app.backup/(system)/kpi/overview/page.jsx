"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function KPIOverviewPage() {

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
      loadOverview()
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

  async function loadOverview() {

    try {

      setLoading(true)

      const response =
        await fetch(
          `/api/kpi/overview?tenantId=${tenantId}`
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

    if (state === 'EXCELLENT') {
      return 'text-emerald-400'
    }

    if (state === 'GOOD') {
      return 'text-blue-400'
    }

    if (state === 'WARNING') {
      return 'text-yellow-400'
    }

    return 'text-red-400'
  }

  if (loading) {

    return (

      <PageWrapper
        title="KPI Overview"
        subtitle="Loading operational KPI intelligence"
      >

        <div className="p-10 text-zinc-400">
          Loading...
        </div>

      </PageWrapper>

    )
  }

  const kpis =
    data?.kpis

  return (

    <PageWrapper
      title="KPI Overview"
      subtitle="Operational KPI intelligence engine"
    >

      <div className="p-6 text-white space-y-6">

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-3">
                KPI Operational State
              </div>

              <div className={`text-6xl font-light ${
                stateColor(
                  kpis?.state
                )
              }`}>

                {
                  kpis?.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              stateColor(
                kpis?.state
              )
            }`}>

              {
                kpis?.operationalScore
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">

          <Metric
            label="Average Order"
            value={`${kpis?.avgOrderValue || 0} ฿`}
          />

          <Metric
            label="Revenue Per Table"
            value={`${kpis?.revenuePerTable || 0} ฿`}
          />

          <Metric
            label="Labor Ratio"
            value={`${kpis?.laborRatio || 0}%`}
          />

          <Metric
            label="Refund Ratio"
            value={`${kpis?.refundRatio || 0}%`}
          />

        </div>

      </div>

    </PageWrapper>

  )
}
