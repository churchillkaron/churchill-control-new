'use client'

import { useEffect, useState } from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function ExecutiveOverviewPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    overview,
    setOverview,
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
          `/api/intelligence/overview?tenantId=${tenantId}`
        )

      const data =
        await response.json()

      setOverview(data)

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
        title="Executive Overview"
        subtitle="Loading enterprise intelligence"
      >

        <div className="p-10 text-zinc-400">
          Loading...
        </div>

      </PageWrapper>

    )
  }

  return (

    <PageWrapper
      title="Executive Overview"
      subtitle="Central operational intelligence layer"
    >

      <div className="p-6 text-white space-y-6">

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-sm text-zinc-500 mb-3">
                Enterprise Intelligence State
              </div>

              <div className={`text-6xl font-light ${
                stateColor(
                  overview?.intelligence?.state
                )
              }`}>

                {
                  overview?.intelligence?.state
                }

              </div>

            </div>

            <div className={`text-8xl font-light ${
              stateColor(
                overview?.intelligence?.state
              )
            }`}>

              {
                overview?.intelligence?.score
              }

            </div>

          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">

          <Metric
            label="Revenue"
            value={`${Number(
              overview?.metrics?.revenue || 0
            ).toLocaleString()} ฿`}
          />

          <Metric
            label="Cost"
            value={`${Number(
              overview?.metrics?.cost || 0
            ).toLocaleString()} ฿`}
          />

          <Metric
            label="Orders"
            value={
              overview?.metrics?.orders || 0
            }
          />

          <Metric
            label="Kitchen Tickets"
            value={
              overview?.metrics?.kitchenTickets || 0
            }
          />

        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">

          <div className="text-2xl font-semibold mb-6">
            Intelligence Alerts
          </div>

          {overview?.intelligence?.alerts?.length === 0 ? (

            <div className="text-zinc-400">
              No active operational alerts detected.
            </div>

          ) : (

            <div className="space-y-4">

              {overview?.intelligence?.alerts?.map(
                (
                  alert,
                  index
                ) => (

                  <div
                    key={index}
                    className={`rounded-2xl border p-5 ${
                      alert.type === 'critical'
                        ? 'border-red-500/30 bg-red-500/10 text-red-300'
                        : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                    }`}
                  >

                    <div className="font-semibold mb-1">
                      {alert.type.toUpperCase()}
                    </div>

                    <div>
                      {alert.message}
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
