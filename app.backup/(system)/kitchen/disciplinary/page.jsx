"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import {
  AlertTriangle,
  Ban,
  ShieldAlert,
  Siren,
} from 'lucide-react'

export default function KitchenDisciplinaryPage() {

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

    loadDisciplinaryReport()

  }, [])

  async function loadDisciplinaryReport() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/disciplinary-report',
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
          ?.disciplinaryReport || []
      )

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  const suspensionRisks =
    report.filter(
      chef =>
        chef.suspensionRisk
    ).length

  const finalWarnings =
    report.filter(
      chef =>
        chef.disciplinaryLevel ===
        'FINAL_WARNING'
    ).length

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Disciplinary Control
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Operational accountability and enforcement oversight
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

        <TopCard
          icon={<ShieldAlert />}
          label="Total Cases"
          value={report.length}
          color="text-blue-400"
        />

        <TopCard
          icon={<AlertTriangle />}
          label="Final Warnings"
          value={finalWarnings}
          color="text-yellow-400"
        />

        <TopCard
          icon={<Ban />}
          label="Suspension Risk"
          value={suspensionRisks}
          color="text-red-400"
        />

        <TopCard
          icon={<Siren />}
          label="Active Violations"
          value={
            report.reduce(
              (
                total,
                chef
              ) =>
                total +
                chef.violations.length,
              0
            )
          }
          color="text-pink-400"
        />

      </div>

      {loading ? (

        <div className="text-zinc-500">
          Loading disciplinary system...
        </div>

      ) : (

        <div className="space-y-6">

          {report.map(
            chef => (

              <ChefDisciplinaryCard
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

function ChefDisciplinaryCard({
  chef,
}) {

  const levelColor =
    chef.disciplinaryLevel ===
    'SUSPENSION_RISK'
      ? 'border-red-500'
      : chef.disciplinaryLevel ===
        'FINAL_WARNING'
      ? 'border-yellow-500'
      : chef.disciplinaryLevel ===
        'WARNING'
      ? 'border-orange-500'
      : 'border-green-500'

  return (

    <div className={`border rounded-3xl bg-zinc-950 p-6 ${levelColor}`}>

      <div className="flex items-center justify-between mb-6">

        <div>

          <div className="text-2xl font-bold">
            {chef.chefName}
          </div>

          <div className="text-zinc-500 text-sm mt-1">
            Disciplinary Enforcement Review
          </div>

        </div>

        <div className="text-right">

          <div className="text-sm text-zinc-500 mb-2">
            Warning Points
          </div>

          <div className="text-4xl font-bold">
            {chef.warningPoints}
          </div>

        </div>

      </div>

      <div className="mb-6">

        <LevelBadge
          level={
            chef.disciplinaryLevel
          }
        />

      </div>

      <div className="space-y-3">

        {chef.violations.map(
          (
            violation,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-2xl bg-black p-4"
            >

              <div className="flex items-center justify-between mb-2">

                <div className="font-semibold">
                  {violation.type}
                </div>

                {violation.prepMinutes && (

                  <div className="text-red-400 text-sm">
                    {violation.prepMinutes}m
                  </div>

                )}

              </div>

              <div className="grid grid-cols-2 gap-3 text-sm text-zinc-400">

                {violation.tableNumber && (

                  <div>
                    Table:
                    {' '}
                    {violation.tableNumber}
                  </div>

                )}

                {violation.dishName && (

                  <div>
                    Dish:
                    {' '}
                    {violation.dishName}
                  </div>

                )}

              </div>

            </div>
          )
        )}

      </div>

    </div>
  )
}

function LevelBadge({
  level,
}) {

  if (
    level ===
    'SUSPENSION_RISK'
  ) {

    return (

      <div className="bg-red-500/20 text-red-400 border border-red-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        SUSPENSION RISK
      </div>

    )
  }

  if (
    level ===
    'FINAL_WARNING'
  ) {

    return (

      <div className="bg-yellow-500/20 text-yellow-400 border border-yellow-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        FINAL WARNING
      </div>

    )
  }

  if (
    level ===
    'WARNING'
  ) {

    return (

      <div className="bg-orange-500/20 text-orange-400 border border-orange-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
        WARNING
      </div>

    )
  }

  return (

    <div className="bg-green-500/20 text-green-400 border border-green-500 rounded-full px-4 py-2 text-sm font-bold w-fit">
      GOOD
    </div>

  )
}
