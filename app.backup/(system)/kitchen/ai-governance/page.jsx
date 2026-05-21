"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import {
  Activity,
  AlertTriangle,
  Brain,
  ShieldCheck,
  Siren,
  TrendingUp,
} from 'lucide-react'

export default function KitchenAIGovernancePage() {

  const tenantId =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

  const [
    governance,
    setGovernance,
  ] = useState(null)

  const [
    loading,
    setLoading,
  ] = useState(true)

  useEffect(() => {

    loadGovernance()

  }, [])

  async function loadGovernance() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/ai-governance',
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

      setGovernance(
        data?.result || null
      )

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  const summary =
    governance?.summary || {}

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-6xl font-bold tracking-tight">
          AI Governance
        </h1>

        <p className="text-zinc-500 mt-4 text-xl">
          Autonomous kitchen intelligence and operational oversight engine
        </p>

      </div>

      {loading ? (

        <div className="text-zinc-500">
          Loading AI governance...
        </div>

      ) : (

        <>
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 mb-8">

            <TopCard
              icon={<Brain />}
              label="AI Status"
              value="ACTIVE"
              color="text-purple-400"
            />

            <TopCard
              icon={<Activity />}
              label="Operational Score"
              value={
                summary.operationalScore || 0
              }
              color="text-blue-400"
            />

            <TopCard
              icon={<ShieldCheck />}
              label="Governance"
              value={
                summary.governanceState || 'STABLE'
              }
              color="text-green-400"
            />

            <TopCard
              icon={<AlertTriangle />}
              label="Risk Alerts"
              value={
                summary.totalAlerts || 0
              }
              color="text-yellow-400"
            />

            <TopCard
              icon={<TrendingUp />}
              label="AI Confidence"
              value={
                summary.aiConfidence || 0
              }
              color="text-pink-400"
            />

          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            <div className="xl:col-span-2 border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

              <div className="flex items-center gap-3 mb-6">

                <Brain />

                <h2 className="text-3xl font-bold">
                  AI Executive Decisions
                </h2>

              </div>

              <div className="space-y-5">

                {(governance?.decisions || []).map(
                  (
                    decision,
                    index
                  ) => (

                    <DecisionCard
                      key={index}
                      decision={decision}
                    />
                  )
                )}

              </div>

            </div>

            <div className="space-y-6">

              <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

                <div className="flex items-center gap-3 mb-6">

                  <ShieldCheck />

                  <h2 className="text-2xl font-bold">
                    Governance State
                  </h2>

                </div>

                <div className="space-y-4">

                  <StatusCard
                    label="AI Core"
                    value="ONLINE"
                    color="text-green-400"
                  />

                  <StatusCard
                    label="Prediction Engine"
                    value="RUNNING"
                    color="text-blue-400"
                  />

                  <StatusCard
                    label="Behavior Analysis"
                    value="ACTIVE"
                    color="text-purple-400"
                  />

                  <StatusCard
                    label="Risk Monitoring"
                    value="ENABLED"
                    color="text-yellow-400"
                  />

                </div>

              </div>

              <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

                <div className="flex items-center gap-3 mb-6">

                  <Siren />

                  <h2 className="text-2xl font-bold">
                    AI Recommendations
                  </h2>

                </div>

                <div className="space-y-4">

                  {(governance?.recommendations || []).map(
                    (
                      recommendation,
                      index
                    ) => (

                      <div
                        key={index}
                        className="border border-zinc-800 rounded-2xl bg-black p-4"
                      >

                        <div className="text-sm text-zinc-300 leading-relaxed">
                          {recommendation}
                        </div>

                      </div>
                    )
                  )}

                </div>

              </div>

            </div>

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

function DecisionCard({
  decision,
}) {

  const critical =
    decision.priority ===
    'CRITICAL'

  return (

    <div className={`
      border rounded-3xl p-6
      ${
        critical
          ? 'border-red-500 bg-red-950/20'
          : 'border-zinc-800 bg-black'
      }
    `}>

      <div className="flex items-center justify-between mb-4">

        <div className="text-2xl font-bold">
          {decision.title}
        </div>

        <div className="text-sm text-zinc-500">
          {decision.priority}
        </div>

      </div>

      <div className="text-zinc-300 leading-relaxed mb-5">

        {decision.message}

      </div>

      <div className="grid grid-cols-2 gap-4 text-sm text-zinc-400">

        <div>
          Impact:
          {' '}
          {decision.impact}
        </div>

        <div>
          Confidence:
          {' '}
          {decision.confidence}
        </div>

      </div>

    </div>

  )
}

function StatusCard({
  label,
  value,
  color,
}) {

  return (

    <div className="border border-zinc-800 rounded-2xl p-4">

      <div className="text-zinc-500 text-sm mb-2">
        {label}
      </div>

      <div className={`font-bold text-lg ${color}`}>
        {value}
      </div>

    </div>

  )
}
