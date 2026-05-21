"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from 'react'

import {
  Activity,
  ChefHat,
  Clock3,
  Flame,
  Gauge,
} from 'lucide-react'

import {
  createKitchenRealtimeChannel,
} from '@/lib/realtime/kitchenRealtimeChannel'

export default function KitchenWorkloadPage() {

  const tenantId =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

  const [
    queue,
    setQueue,
  ] = useState([])

  useEffect(() => {

    const channel =
      createKitchenRealtimeChannel({

        tenantId,

        onQueueInsert:
          data => {

            setQueue(prev => [
              data,
              ...prev,
            ])
          },

        onQueueUpdate:
          data => {

            setQueue(prev =>
              prev.map(item =>
                item.id === data.id
                  ? data
                  : item
              )
            )
          },

      })

    return () => {

      channel.unsubscribe()
    }

  }, [])

  const chefWorkloads =
    useMemo(() => {

      const chefs = {}

      for (
        const item of queue
      ) {

        if (
          !item.chef_id
        ) {
          continue
        }

        if (
          !chefs[
            item.chef_id
          ]
        ) {

          chefs[
            item.chef_id
          ] = {

            chefId:
              item.chef_id,

            chefName:
              item.chef_name,

            activeTickets: 0,

            urgentTickets: 0,

            delayedTickets: 0,

            completedTickets: 0,

            workloadScore: 0,

          }
        }

        const chef =
          chefs[
            item.chef_id
          ]

        if (
          ![
            'COMPLETED',
            'SERVED',
            'VOIDED',
            'CANCELLED',
          ].includes(
            item.status
          )
        ) {

          chef.activeTickets += 1
        }

        if (
          item.priority ===
          'URGENT'
        ) {

          chef.urgentTickets += 1
        }

        if (
          item.status ===
          'DELAYED'
        ) {

          chef.delayedTickets += 1
        }

        if (
          item.status ===
          'COMPLETED'
        ) {

          chef.completedTickets += 1
        }

        chef.workloadScore =
          (
            chef.activeTickets * 2 +
            chef.urgentTickets * 4 +
            chef.delayedTickets * 5
          )

      }

      return Object.values(
        chefs
      ).sort(
        (a, b) =>
          b.workloadScore -
          a.workloadScore
      )

    }, [queue])

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Chef Workload
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Live operational load balancing and pressure monitoring
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

        <TopCard
          icon={<ChefHat />}
          label="Active Chefs"
          value={
            chefWorkloads.length
          }
        />

        <TopCard
          icon={<Activity />}
          label="Total Active"
          value={
            chefWorkloads.reduce(
              (
                total,
                chef
              ) =>
                total +
                chef.activeTickets,
              0
            )
          }
        />

        <TopCard
          icon={<Flame />}
          label="Urgent Load"
          value={
            chefWorkloads.reduce(
              (
                total,
                chef
              ) =>
                total +
                chef.urgentTickets,
              0
            )
          }
        />

        <TopCard
          icon={<Clock3 />}
          label="Delayed"
          value={
            chefWorkloads.reduce(
              (
                total,
                chef
              ) =>
                total +
                chef.delayedTickets,
              0
            )
          }
        />

      </div>

      <div className="space-y-5">

        {chefWorkloads.map(
          chef => (

            <ChefWorkloadCard
              key={chef.chefId}
              chef={chef}
            />
          )
        )}

      </div>

    </div>
  )
}

function TopCard({
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

      <div className="text-4xl font-bold">
        {value}
      </div>

    </div>
  )
}

function ChefWorkloadCard({
  chef,
}) {

  const riskLevel =
    chef.workloadScore >= 40
      ? 'CRITICAL'
      : chef.workloadScore >= 25
      ? 'HIGH'
      : chef.workloadScore >= 10
      ? 'MODERATE'
      : 'LOW'

  const riskColor =
    riskLevel ===
    'CRITICAL'
      ? 'text-red-400 border-red-500'
      : riskLevel ===
        'HIGH'
      ? 'text-yellow-400 border-yellow-500'
      : riskLevel ===
        'MODERATE'
      ? 'text-orange-400 border-orange-500'
      : 'text-green-400 border-green-500'

  return (

    <div className={`border rounded-3xl bg-zinc-950 p-6 ${riskColor}`}>

      <div className="flex items-center justify-between mb-6">

        <div>

          <div className="text-2xl font-bold">
            {chef.chefName}
          </div>

          <div className="text-zinc-500 text-sm mt-1">
            Live Workload Analysis
          </div>

        </div>

        <div className="flex items-center gap-3">

          <Gauge />

          <div className="text-4xl font-bold">
            {chef.workloadScore}
          </div>

        </div>

      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-5">

        <Metric
          label="Active"
          value={
            chef.activeTickets
          }
        />

        <Metric
          label="Urgent"
          value={
            chef.urgentTickets
          }
        />

        <Metric
          label="Delayed"
          value={
            chef.delayedTickets
          }
        />

        <Metric
          label="Completed"
          value={
            chef.completedTickets
          }
        />

        <Metric
          label="Risk"
          value={riskLevel}
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

    <div className="border border-zinc-800 rounded-2xl p-4 bg-black">

      <div className="text-zinc-500 text-sm mb-2">
        {label}
      </div>

      <div className="text-2xl font-bold">
        {value}
      </div>

    </div>
  )
}
