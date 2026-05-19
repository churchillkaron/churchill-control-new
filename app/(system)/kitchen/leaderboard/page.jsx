'use client'

import { useEffect, useState } from 'react'

import {
  Award,
  ChefHat,
  Flame,
  ShieldAlert,
  Trophy,
} from 'lucide-react'

export default function KitchenLeaderboardPage() {

  const tenantId =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

  const [
    leaderboard,
    setLeaderboard,
  ] = useState([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  useEffect(() => {

    loadLeaderboard()

  }, [])

  async function loadLeaderboard() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/leaderboard',
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

      setLeaderboard(
        data?.result
          ?.leaderboard || []
      )

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Kitchen Leaderboard
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Real-time chef performance and accountability ranking
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">

        <StatCard
          icon={<Trophy />}
          label="Top Performer"
          value={
            leaderboard?.[0]
              ?.chefName || '-'
          }
        />

        <StatCard
          icon={<ChefHat />}
          label="Active Chefs"
          value={
            leaderboard.length
          }
        />

        <StatCard
          icon={<ShieldAlert />}
          label="Elite Staff"
          value={
            leaderboard.filter(
              chef =>
                chef.performanceLevel ===
                'ELITE'
            ).length
          }
        />

      </div>

      <div className="border border-zinc-800 rounded-3xl bg-zinc-950 overflow-hidden">

        <div className="grid grid-cols-9 gap-4 border-b border-zinc-800 px-6 py-5 text-sm text-zinc-500 font-semibold">

          <div>Rank</div>
          <div>Chef</div>
          <div>Score</div>
          <div>Level</div>
          <div>Total</div>
          <div>Served</div>
          <div>Returned</div>
          <div>Rejected</div>
          <div>Prep Avg</div>

        </div>

        {loading ? (

          <div className="p-10 text-zinc-500">
            Loading leaderboard...
          </div>

        ) : (

          leaderboard.map(
            chef => (

              <LeaderboardRow
                key={chef.chefId}
                chef={chef}
              />
            )
          )

        )}

      </div>

    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
}) {

  return (

    <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

      <div className="flex items-center justify-between mb-5">

        <div className="text-zinc-500 text-sm">
          {label}
        </div>

        <div className="text-zinc-500">
          {icon}
        </div>

      </div>

      <div className="text-3xl font-bold break-words">
        {value}
      </div>

    </div>
  )
}

function LeaderboardRow({
  chef,
}) {

  return (

    <div className="grid grid-cols-9 gap-4 px-6 py-5 border-b border-zinc-900 items-center hover:bg-black/40 transition-all">

      <div className="font-bold text-xl">

        {chef.rank === 1 && (
          <Award className="text-yellow-400" />
        )}

        {chef.rank !== 1 &&
          chef.rank}

      </div>

      <div>

        <div className="font-semibold">
          {chef.chefName}
        </div>

      </div>

      <div className="font-bold text-lg">
        {chef.performanceScore}
      </div>

      <div>

        <LevelBadge
          level={
            chef.performanceLevel
          }
        />

      </div>

      <div>
        {chef.totalItems}
      </div>

      <div>
        {chef.servedItems}
      </div>

      <div className="text-yellow-400">
        {chef.returnedItems}
      </div>

      <div className="text-red-400">
        {chef.rejectedItems}
      </div>

      <div className="flex items-center gap-2">

        <Flame
          size={15}
          className="text-orange-400"
        />

        {chef.averagePrepMinutes}
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

      <div className="bg-green-500/20 text-green-400 border border-green-500 rounded-full px-3 py-1 text-xs font-bold w-fit">
        ELITE
      </div>

    )
  }

  if (
    level === 'GOOD'
  ) {

    return (

      <div className="bg-blue-500/20 text-blue-400 border border-blue-500 rounded-full px-3 py-1 text-xs font-bold w-fit">
        GOOD
      </div>

    )
  }

  if (
    level === 'WARNING'
  ) {

    return (

      <div className="bg-yellow-500/20 text-yellow-400 border border-yellow-500 rounded-full px-3 py-1 text-xs font-bold w-fit">
        WARNING
      </div>

    )
  }

  return (

    <div className="bg-red-500/20 text-red-400 border border-red-500 rounded-full px-3 py-1 text-xs font-bold w-fit">
      CRITICAL
    </div>

  )
}
