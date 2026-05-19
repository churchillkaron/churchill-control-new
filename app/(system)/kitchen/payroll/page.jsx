'use client'

import { useEffect, useState } from 'react'

import {
  BadgeDollarSign,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

export default function KitchenPayrollPage() {

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

    loadPayrollAdjustments()

  }, [])

  async function loadPayrollAdjustments() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/kitchen/payroll-adjustments',
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
          ?.payrollAdjustments || []
      )

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  const positive =
    report.filter(
      chef =>
        chef.adjustmentAmount > 0
    ).length

  const negative =
    report.filter(
      chef =>
        chef.adjustmentAmount < 0
    ).length

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Payroll Intelligence
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Kitchen compensation governance and performance adjustment engine
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

        <TopCard
          icon={<BadgeDollarSign />}
          label="Tracked Staff"
          value={report.length}
          color="text-blue-400"
        />

        <TopCard
          icon={<TrendingUp />}
          label="Positive Adjustments"
          value={positive}
          color="text-green-400"
        />

        <TopCard
          icon={<TrendingDown />}
          label="Negative Adjustments"
          value={negative}
          color="text-red-400"
        />

        <TopCard
          icon={<ShieldCheck />}
          label="Protected Payroll"
          value={
            report.filter(
              chef =>
                chef.locked === true
            ).length
          }
          color="text-purple-400"
        />

      </div>

      {loading ? (

        <div className="text-zinc-500">
          Loading payroll intelligence...
        </div>

      ) : (

        <div className="space-y-6">

          {report.map(
            chef => (

              <PayrollCard
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

function PayrollCard({
  chef,
}) {

  const positive =
    chef.adjustmentAmount >= 0

  return (

    <div className={`
      border rounded-3xl bg-zinc-950 p-6
      ${
        positive
          ? 'border-green-500'
          : 'border-red-500'
      }
    `}>

      <div className="flex items-center justify-between mb-6">

        <div>

          <div className="text-2xl font-bold">
            {chef.chefName}
          </div>

          <div className="text-zinc-500 text-sm mt-1">
            Payroll Performance Adjustment
          </div>

        </div>

        <div className="text-right">

          <div className="text-sm text-zinc-500 mb-2">
            Adjustment
          </div>

          <div className={`
            text-5xl font-bold
            ${
              positive
                ? 'text-green-400'
                : 'text-red-400'
            }
          `}>

            {positive ? '+' : ''}
            {chef.adjustmentAmount}

          </div>

        </div>

      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-5">

        <Metric
          label="Performance"
          value={
            chef.performanceScore
          }
        />

        <Metric
          label="Multiplier"
          value={
            chef.multiplier
          }
        />

        <Metric
          label="Service Share"
          value={
            chef.serviceChargeShare
          }
        />

        <Metric
          label="Penalties"
          value={
            chef.penalties
          }
        />

        <Metric
          label="Locked"
          value={
            chef.locked
              ? 'YES'
              : 'NO'
          }
        />

      </div>

      <div className="border border-zinc-800 rounded-2xl bg-black p-5 mt-6">

        <div className="text-zinc-500 text-sm mb-3">
          Adjustment Reason
        </div>

        <div className="text-lg font-semibold text-zinc-200">
          {chef.reason}
        </div>

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
