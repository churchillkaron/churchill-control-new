'use client'

import { useEffect, useState } from 'react'

import {
  Activity,
  AlertTriangle,
  Brain,
  ChefHat,
  Clock3,
  Flame,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'

import {
  createKitchenRealtimeChannel,
} from '@/lib/realtime/kitchenRealtimeChannel'

export default function KitchenControlCenterPage() {

  const tenantId =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

  const [
    queue,
    setQueue,
  ] = useState([])

  const [
    alerts,
    setAlerts,
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

        onAlertInsert:
          payload => {

            setAlerts(prev => [
              ...(payload.alerts || []),
              ...prev,
            ])
          },

      })

    return () => {

      channel.unsubscribe()
    }

  }, [])

  const active =
    queue.filter(
      item =>
        ![
          'COMPLETED',
          'SERVED',
          'VOIDED',
          'CANCELLED',
        ].includes(
          item.status
        )
    )

  const urgent =
    queue.filter(
      item =>
        item.priority ===
        'URGENT'
    )

  const delayed =
    queue.filter(
      item =>
        item.status ===
        'DELAYED'
    )

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-6xl font-bold tracking-tight">
          Kitchen Control Center
        </h1>

        <p className="text-zinc-500 mt-4 text-xl">
          Enterprise operational command and AI governance engine
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 mb-8">

        <TopCard
          icon={<ChefHat />}
          label="Active Queue"
          value={active.length}
          color="text-blue-400"
        />

        <TopCard
          icon={<Flame />}
          label="Urgent"
          value={urgent.length}
          color="text-red-400"
        />

        <TopCard
          icon={<Clock3 />}
          label="Delayed"
          value={delayed.length}
          color="text-yellow-400"
        />

        <TopCard
          icon={<AlertTriangle />}
          label="Alerts"
          value={alerts.length}
          color="text-orange-400"
        />

        <TopCard
          icon={<Brain />}
          label="AI Status"
          value="ACTIVE"
          color="text-purple-400"
        />

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <div className="xl:col-span-2 border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

          <div className="flex items-center gap-3 mb-6">

            <Activity />

            <h2 className="text-3xl font-bold">
              Live Kitchen Operations
            </h2>

          </div>

          <div className="space-y-4 max-h-[900px] overflow-auto">

            {queue.map(
              item => (

                <QueueCard
                  key={item.id}
                  item={item}
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
                Governance Status
              </h2>

            </div>

            <div className="space-y-4">

              <StatusCard
                label="Kitchen Engine"
                value="ONLINE"
                color="text-green-400"
              />

              <StatusCard
                label="Realtime Sync"
                value="CONNECTED"
                color="text-blue-400"
              />

              <StatusCard
                label="AI Oversight"
                value="ACTIVE"
                color="text-purple-400"
              />

              <StatusCard
                label="Risk State"
                value={
                  delayed.length > 5
                    ? 'WARNING'
                    : 'STABLE'
                }
                color={
                  delayed.length > 5
                    ? 'text-yellow-400'
                    : 'text-green-400'
                }
              />

            </div>

          </div>

          <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

            <div className="flex items-center gap-3 mb-6">

              <TrendingUp />

              <h2 className="text-2xl font-bold">
                Predictive Alerts
              </h2>

            </div>

            <div className="space-y-4 max-h-[500px] overflow-auto">

              {alerts.map(
                (
                  alert,
                  index
                ) => (

                  <div
                    key={index}
                    className="border border-zinc-800 rounded-2xl bg-black p-4"
                  >

                    <div className="flex items-center justify-between mb-2">

                      <div className="font-semibold">
                        {alert.type}
                      </div>

                      <div className="text-xs text-zinc-500">
                        {alert.priority}
                      </div>

                    </div>

                    <div className="text-sm text-zinc-400 leading-relaxed">
                      {alert.message}
                    </div>

                  </div>
                )
              )}

            </div>

          </div>

        </div>

      </div>

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

      <div className={`text-5xl font-bold ${color}`}>
        {value}
      </div>

    </div>

  )
}

function QueueCard({
  item,
}) {

  const urgent =
    item.priority ===
    'URGENT'

  const delayed =
    item.status ===
    'DELAYED'

  return (

    <div className={`
      border rounded-2xl p-5
      ${
        urgent
          ? 'border-red-500 bg-red-950/20'
          : delayed
          ? 'border-yellow-500 bg-yellow-950/20'
          : 'border-zinc-800 bg-black'
      }
    `}>

      <div className="flex items-center justify-between mb-4">

        <div className="text-2xl font-bold">
          {item.dish_name}
        </div>

        <div className="text-sm text-zinc-400">
          {item.status}
        </div>

      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 text-sm text-zinc-400">

        <div>
          Table:
          {' '}
          {item.table_number}
        </div>

        <div>
          Chef:
          {' '}
          {item.chef_name}
        </div>

        <div>
          Station:
          {' '}
          {item.station}
        </div>

        <div>
          Priority:
          {' '}
          {item.priority}
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
