"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import {
  Brain,
  Crown,
  ShieldCheck,
  Trophy,
} from 'lucide-react'

export default function KitchenSuccessionPage() {

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

    loadSuccessionReport()

  }, [])

  async function loadSuccessionReport() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/succession-planning',
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
          ?.successionReport || []
      )

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  const executive =
    report.filter(
      chef =>
        chef.successionTier ===
        'EXECUTIVE_SUCCESSOR'
    ).length

  const leadership =
    report.filter(
      chef =>
        chef.successionTier ===
        'LEADERSHIP_SUCCESSOR'
    ).length

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Succession Planning
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Executive pipeline and future leadership governance
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

        <TopCard
          icon={<Brain />}
          label="Candidates"
          value={report.length}
          color="text-blue-400"
        />

        <TopCard
          icon={<Crown />}
          label="Executive Successors"
          value={executive}
          color="text-yellow-400"
        />

        <TopCard
          icon={<ShieldCheck />}
          label="Leadership Successors"
          value={leadership}
          color="text-green-400"
        />

        <TopCard
          icon={<Trophy />}
          label="Avg Succession"
          value={
            report.length
              ? Math.round(
                  report.reduce(
                    (
                      total,
                      chef
                    ) =>
                      total +
                      chef.successionScore,
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
          Loading succession intelligence...
        </div>

      ) : (

        <div className="space-y-6">

          {report.map(
            chef => (

              <SuccessionCard
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

function SuccessionCard({
  chef,
}) {

  const borderColor =
    chef.successionTier ===
    'EXECUTIVE_SUCCESSOR'
      ? 'border-yellow-500'
      : chef.successionTier ===
        'LEADERSHIP_SUCCESSOR'
      ? 'border-green-500'
      : chef.successionTier ===
        'MANAGEMENT_TRACK'
      ? 'border-blue-500'
      : 'border-zinc-700'

  return (

    <div className={`border rounded-3xl bg-zinc-950 p-6 ${borderColor}`}>

      <div className="flex items-center justify-between mb-6">

        <div>

          <div className="text-2xl font-bold">
            {chef.chefName}
          </div>

          <div className="text-zinc-500 text-sm mt-1">
            Executive Continuity Assessment
          </div>

        </div>

        <div className="text-right">

          <div className="text-sm text-zinc-500 mb-2">
            Succession Score
          </div>

          <div className="text-5xl font-bold">
            {Math.round(
              chef.successionScore
            )}
          </div>

        </div>

      </div>

      <div className="flex gap-3 flex-wrap mb-6">

        <TierBadge
          tier={
            chef.successionTier
          }
        />

        <FutureRoleBadge
          role={
            chef.futureRole
          }
        />

      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-5">

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

function TierBadge({
  tier,
}) {

  if (
    tier ===
    'EXECUTIVE_SUCCESSOR'
  ) {

    return (

      <div className="bg-yellow-500/20 text-yellow-400 border border-yellow-500 rounded-full px-4 py-2 text-sm font-bold">
        EXECUTIVE SUCCESSOR
      </div>

    )
  }

  if (
    tier ===
    'LEADERSHIP_SUCCESSOR'
  ) {

    return (

      <div className="bg-green-500/20 text-green-400 border border-green-500 rounded-full px-4 py-2 text-sm font-bold">
        LEADERSHIP SUCCESSOR
      </div>

    )
  }

  if (
    tier ===
    'MANAGEMENT_TRACK'
  ) {

    return (

      <div className="bg-blue-500/20 text-blue-400 border border-blue-500 rounded-full px-4 py-2 text-sm font-bold">
        MANAGEMENT TRACK
      </div>

    )
  }

  return (

    <div className="bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-full px-4 py-2 text-sm font-bold">
      STANDARD
    </div>

  )
}

function FutureRoleBadge({
  role,
}) {

  return (

    <div className="bg-purple-500/20 text-purple-400 border border-purple-500 rounded-full px-4 py-2 text-sm font-bold">
      {role}
    </div>

  )
}
