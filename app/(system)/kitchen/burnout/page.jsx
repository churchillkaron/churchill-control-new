'use client'

import { useEffect, useState } from 'react'

import {
  Activity,
  AlertTriangle,
  Brain,
  Flame,
  Siren,
} from 'lucide-react'

export default function KitchenBurnoutPage() {

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

    loadBurnoutReport()

  }, [])

  async function loadBurnoutReport() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/burnout-risk',
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
          ?.burnoutReport || []
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
        chef.burnoutRisk ===
        'CRITICAL'
    ).length

  const high =
    report.filter(
      chef =>
        chef.burnoutRisk ===
        'HIGH'
    ).length

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Burnout Intelligence
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Operational fatigue and psychological overload monitoring
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

        <TopCard
          icon={<Brain />}
          label="Tracked Staff"
          value={report.length}
          color="text-blue-400"
        />

        <TopCard
          icon={<Siren />}
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
          icon={<Flame />}
          label="Pressure Events"
          value={
            report.reduce(
              (
                total,
                chef
              ) =>
                total +
                chef.urgentItems,
              0
            )
          }
          color="text-orange-400"
        />

      </div>

      {loading ? (

        <div className="text-zinc-500">
          Loading burnout intelligence...
        </div>

      ) : (

        <div className="space-y-6">

          {report.map(
            chef => (

              <BurnoutCard
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

function BurnoutCard({
  chef,
}) {

  const riskColor =
    chef.burnoutRisk ===
    'CRITICAL'
      ? 'border-red-500'
      : chef.burnoutRisk ===
        'HIGH'
      ? 'border-yellow-500'
      : chef.burnoutRisk ===
        'MODERATE'
      ? 'border-orange-500'
      : 'border-green-500'

  return (

    <div className={`border rounded-3xl bg-zinc-950 p-6 ${riskColor}`}>

      <div className="flex items-center justify-between mb-6">

        <div>

          <div className="text-2xl font-bold">
            {chef.chefName}
          </div>

          <div className="text-zinc-500 text-sm mt-1">
            Psychological Load Assessment
          </div>

        </div>

        <div className="text-right">

          <div className="text-sm text-zinc-500 mb-2">
            Burnout Score
          </div>

          <div className="text-5xl font-bold">
            {chef.burnoutScore}
          </div>

        </div>

      </div>

      <div className="mb-6">

        <RiskBadge
          risk={
            chef.burnoutRisk
          }
        />

      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-5">

        <Metric
          label="Total Items"
          value={
            chef.totalItems
          }
        />

        <Metric
          label="Urgent"
          value={
            chef.urgentItems
          }
        />

        <Metric
          label="Delayed"
          value={
            chef.delayedItems
          }
        />

        <Metric
          label="Rejected"
          value={
            chef.rejectedItems
          }
        />

        <Metric
          label="Pressure"
          value={
            chef.pressureScore
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

      <div className="bg-red-500/20 text-red-400 border border-red-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        CRITICAL BURNOUT
      </div>

    )
  }

  if (
    risk === 'HIGH'
  ) {

    return (

      <div className="bg-yellow-500/20 text-yellow-400 border border-yellow-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        HIGH RISK
      </div>

    )
  }

  if (
    risk === 'MODERATE'
  ) {

    return (

      <div className="bg-orange-500/20 text-orange-400 border border-orange-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        MODERATE
      </div>

    )
  }

  return (

    <div className="bg-green-500/20 text-green-400 border border-green-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
      LOW RISK
    </div>

  )
}
