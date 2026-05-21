"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from 'react'

import {
  Activity,
  AlertTriangle,
  Brain,
  ChefHat,
  Clock3,
  Flame,
  ShieldAlert,
  Siren,
  TrendingUp,
} from 'lucide-react'

import {
  createKitchenRealtimeChannel,
} from '@/lib/realtime/kitchenRealtimeChannel'

export default function KitchenWarRoomPage() {

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

  const metrics =
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

      const rejected =
        queue.filter(
          item =>
            item.status ===
            'REJECTED'
        )

      return {

        active:
          active.length,

        urgent:
          urgent.length,

        delayed:
          delayed.length,

        rejected:
          rejected.length,

      }

    }, [queue])

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="flex items-center justify-between mb-12">

        <div>

          <h1 className="text-7xl font-black tracking-tight">
            WAR ROOM
          </h1>

          <p className="text-zinc-500 mt-4 text-2xl">
            Autonomous kitchen crisis command and AI escalation system
          </p>

        </div>

        <div className="border border-red-500 bg-red-950/20 rounded-3xl px-8 py-6">

          <div className="text-red-400 text-sm mb-2">
            SYSTEM STATUS
          </div>

          <div className="text-4xl font-black">
            ACTIVE
          </div>

        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

        <MetricCard
          icon={<ChefHat />}
          label="Active Orders"
          value={metrics.active}
          color="text-blue-400"
        />

        <MetricCard
          icon={<Flame />}
          label="Urgent Orders"
          value={metrics.urgent}
          color="text-red-400"
        />

        <MetricCard
          icon={<Clock3 />}
          label="Delayed Orders"
          value={metrics.delayed}
          color="text-yellow-400"
        />

        <MetricCard
          icon={<AlertTriangle />}
          label="Rejected Orders"
          value={metrics.rejected}
          color="text-pink-400"
        />

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        <div className="xl:col-span-7 border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

          <div className="flex items-center gap-3 mb-6">

            <Activity />

            <h2 className="text-3xl font-bold">
              Crisis Operations Feed
            </h2>

          </div>

          <div className="space-y-4 max-h-[950px] overflow-auto">

            {queue.map(
              item => (

                <WarRoomQueueCard
                  key={item.id}
                  item={item}
                />
              )
            )}

          </div>

        </div>

        <div className="xl:col-span-3 border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

          <div className="flex items-center gap-3 mb-6">

            <Siren />

            <h2 className="text-3xl font-bold">
              Escalations
            </h2>

          </div>

          <div className="space-y-4 max-h-[950px] overflow-auto">

            {alerts.map(
              (
                alert,
                index
              ) => (

                <EscalationCard
                  key={index}
                  alert={alert}
                />
              )
            )}

          </div>

        </div>

        <div className="xl:col-span-2 space-y-6">

          <CommandPanel />

          <DefensePanel
            delayed={
              metrics.delayed
            }
            rejected={
              metrics.rejected
            }
          />

        </div>

      </div>

    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  color,
}) {

  return (

    <div className="border border-zinc-800 bg-zinc-950 rounded-3xl p-6">

      <div className="flex items-center justify-between mb-5">

        <div className="text-zinc-500 text-sm">
          {label}
        </div>

        <div className={color}>
          {icon}
        </div>

      </div>

      <div className={`text-5xl font-black ${color}`}>
        {value}
      </div>

    </div>

  )
}

function WarRoomQueueCard({
  item,
}) {

  const critical =
    item.priority ===
      'URGENT' ||
    item.status ===
      'DELAYED'

  return (

    <div className={`
      border rounded-2xl p-5
      ${
        critical
          ? 'border-red-500 bg-red-950/10'
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

function EscalationCard({
  alert,
}) {

  const critical =
    alert.priority ===
    'CRITICAL'

  return (

    <div className={`
      border rounded-2xl p-5
      ${
        critical
          ? 'border-red-500 bg-red-950/20'
          : 'border-zinc-800 bg-black'
      }
    `}>

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

function CommandPanel() {

  return (

    <div className="border border-zinc-800 bg-zinc-950 rounded-3xl p-6">

      <div className="flex items-center gap-3 mb-6">

        <Brain />

        <h2 className="text-2xl font-bold">
          AI Command
        </h2>

      </div>

      <div className="space-y-4">

        <CommandStatus
          label="AI Core"
          value="ONLINE"
          color="text-green-400"
        />

        <CommandStatus
          label="Threat Detection"
          value="ACTIVE"
          color="text-red-400"
        />

        <CommandStatus
          label="Behavior Analysis"
          value="RUNNING"
          color="text-purple-400"
        />

        <CommandStatus
          label="Prediction Layer"
          value="ENABLED"
          color="text-blue-400"
        />

      </div>

    </div>

  )
}

function DefensePanel({
  delayed,
  rejected,
}) {

  const state =
    delayed > 5 ||
    rejected > 3
      ? 'WARNING'
      : 'STABLE'

  return (

    <div className="border border-zinc-800 bg-zinc-950 rounded-3xl p-6">

      <div className="flex items-center gap-3 mb-6">

        <ShieldAlert />

        <h2 className="text-2xl font-bold">
          Defense Layer
        </h2>

      </div>

      <div className="space-y-4">

        <CommandStatus
          label="Kitchen State"
          value={state}
          color={
            state === 'WARNING'
              ? 'text-yellow-400'
              : 'text-green-400'
          }
        />

        <CommandStatus
          label="Protection"
          value="ENABLED"
          color="text-blue-400"
        />

        <CommandStatus
          label="Escalation"
          value="AUTOMATED"
          color="text-purple-400"
        />

      </div>

    </div>

  )
}

function CommandStatus({
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
