"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import {
  AlertTriangle,
  Ban,
  ShieldAlert,
  Skull,
} from 'lucide-react'

export default function KitchenTerminationPage() {

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

    loadTerminationReport()

  }, [])

  async function loadTerminationReport() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/termination-risk',
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
          ?.terminationReport || []
      )

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  const critical =
    report.filter(
      chef =>
        chef.terminationRisk ===
        'CRITICAL'
    ).length

  const high =
    report.filter(
      chef =>
        chef.terminationRisk ===
        'HIGH'
    ).length

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Termination Risk
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Executive risk review and operational enforcement governance
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

        <TopCard
          icon={<ShieldAlert />}
          label="Tracked Staff"
          value={report.length}
          color="text-blue-400"
        />

        <TopCard
          icon={<Skull />}
          label="Critical Risk"
          value={critical}
          color="text-red-400"
        />

        <TopCard
          icon={<AlertTriangle />}
          label="High Risk"
          value={high}
          color="text-yellow-400"
        />

        <TopCard
          icon={<Ban />}
          label="Termination Review"
          value={
            report.filter(
              chef =>
                [
                  'HIGH',
                  'CRITICAL',
                ].includes(
                  chef.terminationRisk
                )
            ).length
          }
          color="text-pink-400"
        />

      </div>

      {loading ? (

        <div className="text-zinc-500">
          Loading termination intelligence...
        </div>

      ) : (

        <div className="space-y-6">

          {report.map(
            chef => (

              <TerminationCard
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

function TerminationCard({
  chef,
}) {

  const borderColor =
    chef.terminationRisk ===
    'CRITICAL'
      ? 'border-red-500'
      : chef.terminationRisk ===
        'HIGH'
      ? 'border-yellow-500'
      : chef.terminationRisk ===
        'MEDIUM'
      ? 'border-orange-500'
      : 'border-green-500'

  return (

    <div className={`border rounded-3xl bg-zinc-950 p-6 ${borderColor}`}>

      <div className="flex items-center justify-between mb-6">

        <div>

          <div className="text-2xl font-bold">
            {chef.chefName}
          </div>

          <div className="text-zinc-500 text-sm mt-1">
            Executive Enforcement Review
          </div>

        </div>

        <div className="text-right">

          <div className="text-sm text-zinc-500 mb-2">
            Risk Points
          </div>

          <div className="text-5xl font-bold">
            {chef.totalRiskPoints}
          </div>

        </div>

      </div>

      <div className="flex gap-3 flex-wrap mb-6">

        <RiskBadge
          risk={
            chef.terminationRisk
          }
        />

      </div>

      <div className="border border-zinc-800 rounded-2xl bg-black p-5 mb-6">

        <div className="text-zinc-500 text-sm mb-3">
          Executive Recommendation
        </div>

        <div className="text-lg font-semibold text-zinc-200">
          {chef.recommendation}
        </div>

      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-5">

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
          label="Cancelled"
          value={
            chef.cancelledItems
          }
        />

        <Metric
          label="Delayed"
          value={
            chef.excessiveDelays
          }
        />

        <Metric
          label="Risk"
          value={
            chef.terminationRisk
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

function RiskBadge({
  risk,
}) {

  if (
    risk === 'CRITICAL'
  ) {

    return (

      <div className="bg-red-500/20 text-red-400 border border-red-500 rounded-full px-4 py-2 text-sm font-bold">
        CRITICAL TERMINATION RISK
      </div>

    )
  }

  if (
    risk === 'HIGH'
  ) {

    return (

      <div className="bg-yellow-500/20 text-yellow-400 border border-yellow-500 rounded-full px-4 py-2 text-sm font-bold">
        HIGH RISK
      </div>

    )
  }

  if (
    risk === 'MEDIUM'
  ) {

    return (

      <div className="bg-orange-500/20 text-orange-400 border border-orange-500 rounded-full px-4 py-2 text-sm font-bold">
        MEDIUM RISK
      </div>

    )
  }

  return (

    <div className="bg-green-500/20 text-green-400 border border-green-500 rounded-full px-4 py-2 text-sm font-bold">
      LOW RISK
    </div>

  )
}
