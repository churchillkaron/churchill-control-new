'use client'

import { useEffect, useState } from 'react'

import {
  Activity,
  AlertTriangle,
  Brain,
  ChefHat,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'

export default function KitchenExecutivePage() {

  const tenantId =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

  const [
    report,
    setReport,
  ] = useState(null)

  const [
    loading,
    setLoading,
  ] = useState(true)

  useEffect(() => {

    loadExecutiveSummary()

  }, [])

  async function loadExecutiveSummary() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/executive-summary',
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
        data?.result || null
      )

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  const summary =
    report?.summary || {}

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Executive Intelligence
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          AI operational governance and kitchen oversight
        </p>

      </div>

      {loading ? (

        <div className="text-zinc-500">
          Loading executive report...
        </div>

      ) : (

        <>
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

            <ExecutiveCard
              icon={<Activity />}
              label="Operational Score"
              value={
                summary.operationalScore || 0
              }
              color="text-blue-400"
            />

            <ExecutiveCard
              icon={<TrendingUp />}
              label="Service Charge"
              value={
                summary.serviceChargeProjection || '-'
              }
              color="text-green-400"
            />

            <ExecutiveCard
              icon={<ShieldCheck />}
              label="Executive Status"
              value={
                summary.executiveDecision || '-'
              }
              color="text-purple-400"
            />

            <ExecutiveCard
              icon={<ChefHat />}
              label="Total Items"
              value={
                summary.totalItems || 0
              }
              color="text-orange-400"
            />

          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            <div className="xl:col-span-2 border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

              <div className="flex items-center gap-3 mb-6">

                <Brain />

                <h2 className="text-2xl font-semibold">
                  AI Executive Analysis
                </h2>

              </div>

              <div className="border border-zinc-800 rounded-2xl p-6 bg-black">

                <div className="text-zinc-300 text-lg leading-relaxed">

                  {summary.executiveMessage}

                </div>

              </div>

              <div className="grid grid-cols-2 xl:grid-cols-3 gap-5 mt-8">

                <MetricCard
                  label="Completed"
                  value={
                    summary.completedItems || 0
                  }
                />

                <MetricCard
                  label="Served"
                  value={
                    summary.servedItems || 0
                  }
                />

                <MetricCard
                  label="Returned"
                  value={
                    summary.returnedItems || 0
                  }
                />

                <MetricCard
                  label="Rejected"
                  value={
                    summary.rejectedItems || 0
                  }
                />

                <MetricCard
                  label="Cancelled"
                  value={
                    summary.cancelledItems || 0
                  }
                />

              </div>

            </div>

            <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

              <div className="flex items-center gap-3 mb-6">

                <AlertTriangle />

                <h2 className="text-2xl font-semibold">
                  Governance State
                </h2>

              </div>

              <div className="space-y-5">

                <GovernanceStatus
                  label="AI Oversight"
                  value="ACTIVE"
                  color="text-green-400"
                />

                <GovernanceStatus
                  label="Operational Governance"
                  value={
                    summary.executiveDecision || '-'
                  }
                  color="text-blue-400"
                />

                <GovernanceStatus
                  label="Financial Protection"
                  value={
                    summary.serviceChargeProjection || '-'
                  }
                  color="text-yellow-400"
                />

                <GovernanceStatus
                  label="System Status"
                  value="STABLE"
                  color="text-purple-400"
                />

              </div>

            </div>

          </div>
        </>
      )}

    </div>
  )
}

function ExecutiveCard({
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

function MetricCard({
  label,
  value,
}) {

  return (

    <div className="border border-zinc-800 rounded-2xl bg-zinc-950 p-5">

      <div className="text-zinc-500 text-sm mb-3">
        {label}
      </div>

      <div className="text-3xl font-bold">
        {value}
      </div>

    </div>
  )
}

function GovernanceStatus({
  label,
  value,
  color,
}) {

  return (

    <div className="border border-zinc-800 rounded-2xl p-5">

      <div className="text-zinc-500 text-sm mb-2">
        {label}
      </div>

      <div className={`font-bold text-lg ${color}`}>
        {value}
      </div>

    </div>
  )
}
