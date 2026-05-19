'use client'

import { useEffect, useState } from 'react'

import {
  Award,
  Crown,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'

export default function KitchenPromotionPage() {

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

    loadPromotionReport()

  }, [])

  async function loadPromotionReport() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/promotion-eligibility',
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
          ?.promotionReport || []
      )

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  const executiveTrack =
    report.filter(
      chef =>
        chef.promotionEligibility ===
        'EXECUTIVE_CHEF_TRACK'
    ).length

  const sousTrack =
    report.filter(
      chef =>
        chef.promotionEligibility ===
        'SOUS_CHEF_TRACK'
    ).length

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Promotion Intelligence
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Leadership pipeline and advancement governance
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

        <TopCard
          icon={<Award />}
          label="Candidates"
          value={report.length}
          color="text-blue-400"
        />

        <TopCard
          icon={<Crown />}
          label="Executive Track"
          value={executiveTrack}
          color="text-yellow-400"
        />

        <TopCard
          icon={<ShieldCheck />}
          label="Sous Chef Track"
          value={sousTrack}
          color="text-green-400"
        />

        <TopCard
          icon={<TrendingUp />}
          label="Avg Leadership"
          value={
            report.length
              ? Math.round(
                  report.reduce(
                    (
                      total,
                      chef
                    ) =>
                      total +
                      chef.leadershipScore,
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
          Loading promotion intelligence...
        </div>

      ) : (

        <div className="space-y-6">

          {report.map(
            chef => (

              <PromotionCard
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

function PromotionCard({
  chef,
}) {

  const borderColor =
    chef.promotionEligibility ===
    'EXECUTIVE_CHEF_TRACK'
      ? 'border-yellow-500'
      : chef.promotionEligibility ===
        'SOUS_CHEF_TRACK'
      ? 'border-green-500'
      : chef.promotionEligibility ===
        'TEAM_LEAD_TRACK'
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
            Leadership Advancement Review
          </div>

        </div>

        <div className="text-right">

          <div className="text-sm text-zinc-500 mb-2">
            Leadership Score
          </div>

          <div className="text-5xl font-bold">
            {Math.round(
              chef.leadershipScore
            )}
          </div>

        </div>

      </div>

      <div className="flex gap-3 flex-wrap mb-6">

        <EligibilityBadge
          level={
            chef.promotionEligibility
          }
        />

        <RoleBadge
          role={
            chef.recommendedRole
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

function EligibilityBadge({
  level,
}) {

  if (
    level ===
    'EXECUTIVE_CHEF_TRACK'
  ) {

    return (

      <div className="bg-yellow-500/20 text-yellow-400 border border-yellow-500 rounded-full px-4 py-2 text-sm font-bold">
        EXECUTIVE TRACK
      </div>

    )
  }

  if (
    level ===
    'SOUS_CHEF_TRACK'
  ) {

    return (

      <div className="bg-green-500/20 text-green-400 border border-green-500 rounded-full px-4 py-2 text-sm font-bold">
        SOUS CHEF TRACK
      </div>

    )
  }

  if (
    level ===
    'TEAM_LEAD_TRACK'
  ) {

    return (

      <div className="bg-blue-500/20 text-blue-400 border border-blue-500 rounded-full px-4 py-2 text-sm font-bold">
        TEAM LEAD TRACK
      </div>

    )
  }

  return (

    <div className="bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-full px-4 py-2 text-sm font-bold">
      NOT ELIGIBLE
    </div>

  )
}

function RoleBadge({
  role,
}) {

  return (

    <div className="bg-purple-500/20 text-purple-400 border border-purple-500 rounded-full px-4 py-2 text-sm font-bold">
      {role}
    </div>

  )
}
