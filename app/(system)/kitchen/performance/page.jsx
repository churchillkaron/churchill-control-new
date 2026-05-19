'use client'

import { useEffect, useState } from 'react'

import {
  Activity,
  ChefHat,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'

export default function KitchenPerformancePage() {

  const tenantId =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

  const [
    report,
    setReport,
  ] = useState([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  useEffect(() => {

    loadPerformance()

  }, [])

  async function loadPerformance() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/performance',
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

      setReport(
        data?.result
          ?.performanceReport || []
      )

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  const elite =
    report.filter(
      chef =>
        chef.performanceLevel ===
        'ELITE'
    ).length

  const critical =
    report.filter(
      chef =>
        chef.performanceLevel ===
        'CRITICAL'
    ).length

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Performance Intelligence
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Real-time kitchen performance governance and operational scoring
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

        <TopCard
          icon={<ChefHat />}
          label="Tracked Staff"
          value={report.length}
          color="text-blue-400"
        />

        <TopCard
          icon={<ShieldCheck />}
          label="Elite Staff"
          value={elite}
          color="text-green-400"
        />

        <TopCard
          icon={<Activity />}
          label="Critical Staff"
          value={critical}
          color="text-red-400"
        />

        <TopCard
          icon={<TrendingUp />}
          label="Avg Performance"
          value={
            report.length
              ? Math.round(
                  report.reduce(
                    (
                      total,
                      chef
                    ) =>
                      total +
                      chef.performanceScore,
                    0
                  ) /
                  report.length
                )
              : 0
          }
          color="text-purple-400"
        />

      </div>

      {loading ? (

        <div className="text-zinc-500">
          Loading performance intelligence...
        </div>

      ) : (

        <div className="space-y-6">

          {report.map(
            chef => (

              <PerformanceCard
                key={chef.chefId}
                chef={chef}
              />
            )
          )}

        </div>

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

function PerformanceCard({
  chef,
}) {

  const borderColor =
    chef.performanceLevel ===
    'ELITE'
      ? 'border-green-500'
      : chef.performanceLevel ===
        'GOOD'
      ? 'border-blue-500'
      : chef.performanceLevel ===
        'WARNING'
      ? 'border-yellow-500'
      : 'border-red-500'

  return (

    <div className={`border rounded-3xl bg-zinc-950 p-6 ${borderColor}`}>

      <div className="flex items-center justify-between mb-6">

        <div>

          <div className="text-2xl font-bold">
            {chef.chefName}
          </div>

          <div className="text-zinc-500 text-sm mt-1">
            Operational Performance Assessment
          </div>

        </div>

        <div className="text-right">

          <div className="text-sm text-zinc-500 mb-2">
            Performance Score
          </div>

          <div className="text-5xl font-bold">
            {chef.performanceScore}
          </div>

        </div>

      </div>

      <div className="mb-6">

        <LevelBadge
          level={
            chef.performanceLevel
          }
        />

      </div>

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-5">

        <Metric
          label="Total"
          value={
            chef.totalItems
          }
        />

        <Metric
          label="Completed"
          value={
            chef.completedItems
          }
        />

        <Metric
          label="Served"
          value={
            chef.servedItems
          }
        />

        <Metric
          label="Returned"
          value={
            chef.returnedItems
          }
        />

        <Metric
          label="Rejected"
          value={
            chef.rejectedItems
          }
        />

        <Metric
          label="Avg Prep"
          value={
            chef.averagePrepMinutes
          }
        />

      </div>

    </div>
  )
}

function Metric({
  label,
  value,
}) {

  return (

    <div className="border border-zinc-800 rounded-2xl bg-black p-4">

      <div className="text-zinc-500 text-sm mb-2">
        {label}
      </div>

      <div className="text-2xl font-bold">
        {value}
      </div>

    </div>

  )
}

function LevelBadge({
  level,
}) {

  if (
    level === 'ELITE'
  ) {

    return (

      <div className="bg-green-500/20 text-green-400 border border-green-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        ELITE PERFORMANCE
      </div>

    )
  }

  if (
    level === 'GOOD'
  ) {

    return (

      <div className="bg-blue-500/20 text-blue-400 border border-blue-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        GOOD PERFORMANCE
      </div>

    )
  }

  if (
    level === 'WARNING'
  ) {

    return (

      <div className="bg-yellow-500/20 text-yellow-400 border border-yellow-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        WARNING
      </div>

    )
  }

  return (

    <div className="bg-red-500/20 text-red-400 border border-red-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
      CRITICAL
    </div>

  )
}
