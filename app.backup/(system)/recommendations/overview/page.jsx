"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function RecommendationsOverviewPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    recommendations,
    setRecommendations,
  ] = useState([])

  useEffect(() => {

    loadTenant()

  }, [])

  useEffect(() => {

    if (tenantId) {
      loadRecommendations()
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

  async function loadRecommendations() {

    try {

      setLoading(true)

      const response =
        await fetch(
          `/api/recommendations/overview?tenantId=${tenantId}`
        )

      const json =
        await response.json()

      setRecommendations(
        json.recommendations || []
      )

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  function priorityStyle(priority) {

    if (priority === 'critical') {

      return 'border-red-500/30 bg-red-500/10 text-red-300'
    }

    if (priority === 'high') {

      return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
    }

    if (priority === 'medium') {

      return 'border-blue-500/30 bg-blue-500/10 text-blue-300'
    }

    return 'border-zinc-700 bg-zinc-900 text-zinc-300'
  }

  if (loading) {

    return (

      <PageWrapper
        title="AI Recommendations"
        subtitle="Loading operational intelligence recommendations"
      >

        <div className="p-10 text-zinc-400">
          Loading...
        </div>

      </PageWrapper>

    )
  }

  return (

    <PageWrapper
      title="AI Recommendations"
      subtitle="Operational intelligence recommendation engine"
    >

      <div className="p-6 text-white">

        <div className="space-y-5">

          {recommendations.map(
            (
              recommendation,
              index
            ) => (

              <div
                key={index}
                className={`rounded-3xl border p-6 ${
                  priorityStyle(
                    recommendation.priority
                  )
                }`}
              >

                <div className="flex items-center justify-between mb-4">

                  <div className="text-2xl font-semibold">
                    {recommendation.title}
                  </div>

                  <div className="uppercase text-xs tracking-widest">
                    {recommendation.priority}
                  </div>

                </div>

                <div className="text-sm opacity-70 mb-4 uppercase tracking-widest">
                  {recommendation.category}
                </div>

                <div className="text-lg">
                  {recommendation.action}
                </div>

              </div>

            )
          )}

        </div>

      </div>

    </PageWrapper>

  )
}
