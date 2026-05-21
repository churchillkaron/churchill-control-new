"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import {
  Activity,
  Brain,
  Clock3,
  TrendingUp,
} from 'lucide-react'

export default function KitchenAnalyticsPage() {

  const tenantId =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

  const [
    analytics,
    setAnalytics,
  ] = useState(null)

  const [
    loading,
    setLoading,
  ] = useState(true)

  useEffect(() => {

    loadAnalytics()

  }, [])

  async function loadAnalytics() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/analytics',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({

              tenantId,

            }),

          }
        )

      const data =
        await response.json()

      setAnalytics(
        data?.result || null
      )

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  const summary =
    analytics?.summary || {}

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Kitchen Analytics
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Enterprise operational analytics and intelligence engine
        </p>

      </div>

      {loading ? (

        <div className="text-zinc-500">
          Loading analytics...
        </div>

      ) : (

        <>
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

            <TopCard
              icon={<Activity />}
              label="Operational Score"
              value={
                summary.operationalScore || 0
              }
              color="text-blue-400"
            />

            <TopCard
              icon={<Clock3 />}
              label="Avg Prep"
              value={
                summary.averagePrepMinutes || 0
              }
              color="text-yellow-400"
            />

            <TopCard
              icon={<TrendingUp />}
              label="Completion Rate"
              value={
                summary.completionRate || 0
              }
              color="text-green-400"
            />

            <TopCard
              icon={<Brain />}
              label="AI Rating"
              value={
                summary.aiRating || '-'
              }
              color="text-purple-400"
            />

          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            <AnalyticsPanel
              title="Station Analytics"
              data={
                analytics?.stationAnalytics || []
              }
            />

            <AnalyticsPanel
              title="Chef Analytics"
              data={
                analytics?.chefAnalytics || []
              }
            />

          </div>

        </>
      )}

    </div>
  )
}

function TopCard({
  icon,
  label,
  value,
  color,
}) {

  return (

    <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

      <div className="flex items-center justify-between mb-5">

        <div className="text-zinc-500 text-sm">
          {label}
        </div>

        <div className={color}>
          {icon}
        </div>

      </div>

      <div className={`text-4xl font-bold ${color}`}>
        {value}
      </div>

    </div>

  )
}

function AnalyticsPanel({
  title,
  data,
}) {

  return (

    <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

      <div className="text-2xl font-bold mb-6">
        {title}
      </div>

      <div className="space-y-4">

        {data.map(
          (
            item,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-2xl bg-black p-5"
            >

              <div className="flex items-center justify-between mb-4">

                <div className="font-bold text-lg">
                  {item.name}
                </div>

                <div className="text-2xl font-bold">
                  {item.score}
                </div>

              </div>

              <div className="grid grid-cols-2 gap-4 text-sm text-zinc-400">

                <div>
                  Completed:
                  {' '}
                  {item.completed}
                </div>

                <div>
                  Delayed:
                  {' '}
                  {item.delayed}
                </div>

                <div>
                  Returned:
                  {' '}
                  {item.returned}
                </div>

                <div>
                  Avg Prep:
                  {' '}
                  {item.averagePrep}
                </div>

              </div>

            </div>
          )
        )}

      </div>

    </div>

  )
}
