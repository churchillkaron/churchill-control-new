'use client'

import { useEffect, useState } from 'react'

import {
  Brain,
  ShieldCheck,
  Siren,
  Users,
} from 'lucide-react'

export default function KitchenCulturePage() {

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

    loadCultureReport()

  }, [])

  async function loadCultureReport() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/culture-score',
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
          ?.cultureReport || []
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
        chef.cultureLevel ===
        'ELITE'
    ).length

  const toxic =
    report.filter(
      chef =>
        chef.cultureLevel ===
        'TOXIC_RISK'
    ).length

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Culture Intelligence
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Behavioral consistency and operational culture governance
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

        <TopCard
          icon={<Users />}
          label="Tracked Staff"
          value={report.length}
          color="text-blue-400"
        />

        <TopCard
          icon={<ShieldCheck />}
          label="Elite Culture"
          value={elite}
          color="text-green-400"
        />

        <TopCard
          icon={<Siren />}
          label="Toxic Risk"
          value={toxic}
          color="text-red-400"
        />

        <TopCard
          icon={<Brain />}
          label="Avg Culture"
          value={
            report.length
              ? Math.round(
                  report.reduce(
                    (
                      total,
                      chef
                    ) =>
                      total +
                      chef.cultureScore,
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
          Loading culture intelligence...
        </div>

      ) : (

        <div className="space-y-6">

          {report.map(
            chef => (

              <CultureCard
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

function CultureCard({
  chef,
}) {

  const borderColor =
    chef.cultureLevel ===
    'TOXIC_RISK'
      ? 'border-red-500'
      : chef.cultureLevel ===
        'WARNING'
      ? 'border-yellow-500'
      : chef.cultureLevel ===
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
            Operational Culture Assessment
          </div>

        </div>

        <div className="text-right">

          <div className="text-sm text-zinc-500 mb-2">
            Culture Score
          </div>

          <div className="text-5xl font-bold">
            {chef.cultureScore}
          </div>

        </div>

      </div>

      <div className="mb-6">

        <CultureBadge
          level={
            chef.cultureLevel
          }
        />

      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">

        <Metric
          label="Teamwork"
          value={
            Math.round(
              chef.teamworkScore
            )
          }
        />

        <Metric
          label="Discipline"
          value={
            Math.round(
              chef.disciplineScore
            )
          }
        />

        <Metric
          label="Consistency"
          value={
            Math.round(
              chef.consistencyScore
            )
          }
        />

        <Metric
          label="Pressure"
          value={
            Math.round(
              chef.pressureHandlingScore
            )
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

function CultureBadge({
  level,
}) {

  if (
    level === 'ELITE'
  ) {

    return (

      <div className="bg-green-500/20 text-green-400 border border-green-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        ELITE CULTURE
      </div>

    )
  }

  if (
    level === 'GOOD'
  ) {

    return (

      <div className="bg-blue-500/20 text-blue-400 border border-blue-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        GOOD CULTURE
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
      TOXIC RISK
    </div>

  )
}
