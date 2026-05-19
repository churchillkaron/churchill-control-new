'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  Activity,
  AlertTriangle,
  Brain,
  ChefHat,
  Clock3,
  Crown,
  Flame,
  ShieldCheck,
  Siren,
  TrendingUp,
} from 'lucide-react'

import {
  createKitchenRealtimeChannel,
} from '@/lib/realtime/kitchenRealtimeChannel'

export default function KitchenMissionControlPage() {

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

  const stats =
    useMemo(() => {

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

      const completed =
        queue.filter(
          item =>
            item.status ===
            'COMPLETED'
        )

      return {

        active:
          active.length,

        urgent:
          urgent.length,

        delayed:
          delayed.length,

        completed:
          completed.length,

      }

    }, [queue])

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-7xl font-bold tracking-tight">
            Mission Control
          </h1>

          <p className="text-zinc-500 mt-4 text-2xl">
            Autonomous enterprise kitchen operating intelligence
          </p>

        </div>

        <div className="flex items-center gap-4 border border-zinc-800 rounded-3xl bg-zinc-950 px-6 py-5">

          <Brain className="text-purple-400" size={38} />

          <div>

            <div className="text-zinc-500 text-sm">
              AI Governance
            </div>

            <div className="text-2xl font-bold text-green-400">
              ACTIVE
            </div>

          </div>

        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 mb-8">

        <TopCard
          icon={<ChefHat />}
          label="Active Queue"
          value={stats.active}
          color="text-blue-400"
        />

        <TopCard
          icon={<Flame />}
          label="Urgent"
          value={stats.urgent}
          color="text-red-400"
        />

        <TopCard
          icon={<Clock3 />}
          label="Delayed"
          value={stats.delayed}
          color="text-yellow-400"
        />

        <TopCard
          icon={<ShieldCheck />}
          label="Completed"
          value={stats.completed}
          color="text-green-400"
        />

        <TopCard
          icon={<AlertTriangle />}
          label="AI Alerts"
          value={alerts.length}
          color="text-orange-400"
        />

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        <div className="xl:col-span-2 border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

          <div className="flex items-center gap-3 mb-6">

            <Activity />

            <h2 className="text-3xl font-bold">
              Live Operations
            </h2>

          </div>

          <div className="space-y-4 max-h-[850px] overflow-auto">

            {queue.map(
              item => (

                <OperationCard
                  key={item.id}
                  item={item}
                />
              )
            )}

          </div>

        </div>

        <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

          <div className="flex items-center gap-3 mb-6">

            <Siren />

            <h2 className="text-3xl font-bold">
              AI Alerts
            </h2>

          </div>

          <div className="space-y-4 max-h-[850px] overflow-auto">

            {alerts.map(
              (
                alert,
                index
              ) => (

                <AlertCard
                  key={index}
                  alert={alert}
                />
              )
            )}

          </div>

        </div>

        <div className="space-y-6">

          <GovernancePanel />

          <PerformancePanel
            queue={queue}
          />

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

function OperationCard({
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

        <div className="text-sm text-zinc-500">
          {item.status}
        </div>

      </div>

      <div className="grid grid-cols-2 gap-4 text-sm text-zinc-400">

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

function AlertCard({
  alert,
}) {

  return (

    <div className="border border-zinc-800 rounded-2xl bg-black p-5">

      <div className="flex items-center justify-between mb-3">

        <div className="font-bold text-lg">
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
}

function GovernancePanel() {

  return (

    <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

      <div className="flex items-center gap-3 mb-6">

        <Brain />

        <h2 className="text-2xl font-bold">
          Governance
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
          label="Protection Layer"
          value="ENABLED"
          color="text-yellow-400"
        />

      </div>

    </div>

  )
}

function PerformancePanel({
  queue,
}) {

  const chefs =
    [...new Set(
      queue.map(
        item =>
          item.chef_name
      )
    )]

  return (

    <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

      <div className="flex items-center gap-3 mb-6">

        <Crown />

        <h2 className="text-2xl font-bold">
          Performance
        </h2>

      </div>

      <div className="space-y-4">

        <StatusCard
          label="Active Chefs"
          value={chefs.length}
          color="text-green-400"
        />

        <StatusCard
          label="Kitchen State"
          value="STABLE"
          color="text-blue-400"
        />

        <StatusCard
          label="Service Level"
          value="ELITE"
          color="text-purple-400"
        />

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
