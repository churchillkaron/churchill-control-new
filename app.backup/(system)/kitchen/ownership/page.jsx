"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import {
  Activity,
  AlertTriangle,
  ShieldCheck,
  UserCog,
} from 'lucide-react'

export default function KitchenOwnershipPage() {

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

    loadOwnershipReport()

  }, [])

  async function loadOwnershipReport() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/ownership-matrix',
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
          ?.ownershipMatrix || []
      )

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  const highRisk =
    report.filter(
      chef =>
        chef.accountabilityLevel ===
        'CRITICAL'
    ).length

  const elite =
    report.filter(
      chef =>
        chef.accountabilityLevel ===
        'ELITE'
    ).length

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Ownership Matrix
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Accountability governance and operational ownership intelligence
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

        <TopCard
          icon={<UserCog />}
          label="Tracked Staff"
          value={report.length}
          color="text-blue-400"
        />

        <TopCard
          icon={<ShieldCheck />}
          label="Elite Ownership"
          value={elite}
          color="text-green-400"
        />

        <TopCard
          icon={<AlertTriangle />}
          label="Critical Risk"
          value={highRisk}
          color="text-red-400"
        />

        <TopCard
          icon={<Activity />}
          label="Avg Accountability"
          value={
            report.length
              ? Math.round(
                  report.reduce(
                    (
                      total,
                      chef
                    ) =>
                      total +
                      chef.accountabilityScore,
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
          Loading ownership intelligence...
        </div>

      ) : (

        <div className="space-y-6">

          {report.map(
            chef => (

              <OwnershipCard
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

function OwnershipCard({
  chef,
}) {

  const borderColor =
    chef.accountabilityLevel ===
    'CRITICAL'
      ? 'border-red-500'
      : chef.accountabilityLevel ===
        'WARNING'
      ? 'border-yellow-500'
      : chef.accountabilityLevel ===
        'GOOD'
      ? 'border-blue-500'
      : 'border-green-500'

  return (

    <div className={`border rounded-3xl bg-zinc-950 p-6 ${borderColor}`}>

      <div className="flex items-center justify-between mb-6">

        <div>

          <div className="text-2xl font-bold">
            {chef.chefName}
          </div>

          <div className="text-zinc-500 text-sm mt-1">
            Accountability Ownership Assessment
          </div>

        </div>

        <div className="text-right">

          <div className="text-sm text-zinc-500 mb-2">
            Accountability Score
          </div>

          <div className="text-5xl font-bold">
            {chef.accountabilityScore}
          </div>

        </div>

      </div>

      <div className="mb-6">

        <OwnershipBadge
          level={
            chef.accountabilityLevel
          }
        />

      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-5">

        <Metric
          label="Assigned"
          value={
            chef.assignedItems
          }
        />

        <Metric
          label="Completed"
          value={
            chef.completedItems
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
          label="Ownership"
          value={
            chef.accountabilityLevel
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

function OwnershipBadge({
  level,
}) {

  if (
    level === 'ELITE'
  ) {

    return (

      <div className="bg-green-500/20 text-green-400 border border-green-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        ELITE OWNERSHIP
      </div>

    )
  }

  if (
    level === 'GOOD'
  ) {

    return (

      <div className="bg-blue-500/20 text-blue-400 border border-blue-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        GOOD OWNERSHIP
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
