"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function AnomalyOverviewPage() {

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
          `/api/anomaly/overview?tenantId=${tenantId}`
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

  if (loading) {

    return (

      <PageWrapper
        title="Anomaly Detection"
        subtitle="Loading operational anomaly intelligence"
      >

        <div className="p-10 text-zinc-400">
          Loading...
        </div>

      </PageWrapper>

    )
  }

  return (

    <PageWrapper
      title="Anomaly Detection"
      subtitle="Operational anomaly monitoring engine"
    >

      <div className="p-6 text-white space-y-6">

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">

          <Metric
            label="Revenue"
            value={`${Math.round(
              data?.metrics?.revenue || 0
            ).toLocaleString()} ฿`}
          />

          <Metric
            label="Average Revenue"
            value={`${Math.round(
              data?.metrics?.averageRevenue || 0
            ).toLocaleString()} ฿`}
          />

          <Metric
            label="Food Cost"
            value={`${(
              data?.metrics?.foodCost || 0
            ).toFixed(2)}%`}
          />

          <Metric
            label="Average Food Cost"
            value={`${(
              data?.metrics?.averageFoodCost || 0
            ).toFixed(2)}%`}
          />

        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">

          <div className="text-2xl font-semibold mb-6">
            Detected Anomalies
          </div>

          {data?.anomalies?.length === 0 ? (

            <div className="text-zinc-400">
              No anomalies detected.
            </div>

          ) : (

            <div className="space-y-4">

              {data?.anomalies?.map(
                (
                  anomaly,
                  index
                ) => (

                  <div
                    key={index}
                    className={`rounded-2xl border p-5 ${
                      anomaly.type === 'critical'
                        ? 'border-red-500/30 bg-red-500/10 text-red-300'
                        : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                    }`}
                  >

                    <div className="text-lg font-semibold mb-2">
                      {anomaly.title}
                    </div>

                    <div>
                      {anomaly.message}
                    </div>

                  </div>

                )
              )}

            </div>

          )}

        </div>

      </div>

    </PageWrapper>

  )
}
