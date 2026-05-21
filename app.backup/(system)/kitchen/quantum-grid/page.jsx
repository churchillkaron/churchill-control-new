"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from 'react'

import {
  Activity,
  AlertTriangle,
  Atom,
  Brain,
  ChefHat,
  Clock3,
  Cpu,
  Flame,
  Infinity,
  Network,
  Orbit,
  Radar,
  Shield,
  Siren,
  Sparkles,
  Waves,
  Zap,
} from 'lucide-react'

import {
  createKitchenRealtimeChannel,
} from '@/lib/realtime/kitchenRealtimeChannel'

export default function KitchenQuantumGridPage() {

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
            ].includes(item.status)
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

      return {

        active:
          active.length,

        urgent:
          urgent.length,

        delayed:
          delayed.length,

        alerts:
          alerts.length,

      }

    }, [queue, alerts])

  const aiState =
    metrics.delayed > 150
      ? 'UNSTABLE'
      : metrics.urgent > 120
      ? 'OVERCLOCK'
      : 'QUANTUM'

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="flex items-center justify-between mb-12">

        <div>

          <h1 className="text-8xl font-black tracking-tight">
            QUANTUM GRID
          </h1>

          <p className="text-zinc-500 mt-4 text-2xl">
            Quantum restaurant intelligence and realtime autonomous orchestration
          </p>

        </div>

        <div className="border border-purple-400 bg-purple-950/20 rounded-3xl px-8 py-6">

          <div className="text-purple-400 text-sm mb-2">
            QUANTUM STATUS
          </div>

          <div className="text-5xl font-black">
            ENTANGLED
          </div>

        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-8 gap-6 mb-8">

        <MetricCard icon={<ChefHat />} label="Active" value={metrics.active} color="text-blue-400" />
        <MetricCard icon={<Flame />} label="Urgent" value={metrics.urgent} color="text-red-400" />
        <MetricCard icon={<Clock3 />} label="Delayed" value={metrics.delayed} color="text-yellow-400" />
        <MetricCard icon={<Radar />} label="Threats" value={metrics.alerts} color="text-orange-400" />
        <MetricCard icon={<Brain />} label="AI" value={aiState} color="text-cyan-400" />
        <MetricCard icon={<Sparkles />} label="Autonomy" value="∞∞∞∞∞∞∞∞∞" color="text-fuchsia-400" />
        <MetricCard icon={<Network />} label="Network" value="SYNCED" color="text-green-400" />
        <MetricCard icon={<Infinity />} label="Scale" value="QUANTUM" color="text-purple-400" />

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        <div className="xl:col-span-8 border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

          <div className="flex items-center gap-3 mb-6">

            <Activity />

            <h2 className="text-3xl font-bold">
              Quantum Operations Matrix
            </h2>

          </div>

          <div className="space-y-4 max-h-[950px] overflow-auto">

            {queue.map(item => (

              <OperationCard
                key={item.id}
                item={item}
              />

            ))}

          </div>

        </div>

        <div className="xl:col-span-4 space-y-6">

          <CorePanel aiState={aiState} />

          <ThreatPanel alerts={alerts} />

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

      <div className={`text-4xl font-black ${color}`}>
        {value}
      </div>

    </div>

  )
}

function OperationCard({
  item,
}) {

  return (

    <div className="border border-zinc-800 rounded-2xl bg-black p-5">

      <div className="flex items-center justify-between mb-4">

        <div className="text-2xl font-bold">
          {item.dish_name}
        </div>

        <div className="text-sm text-zinc-500">
          {item.status}
        </div>

      </div>

      <div className="grid grid-cols-2 gap-4 text-sm text-zinc-400">

        <div>Table: {item.table_number}</div>
        <div>Chef: {item.chef_name}</div>
        <div>Station: {item.station}</div>
        <div>Priority: {item.priority}</div>

      </div>

    </div>

  )
}

function CorePanel({
  aiState,
}) {

  return (

    <div className="border border-zinc-800 bg-zinc-950 rounded-3xl p-6">

      <div className="flex items-center gap-3 mb-6">

        <Cpu />

        <h2 className="text-2xl font-bold">
          Quantum Core
        </h2>

      </div>

      <div className="space-y-4">

        <StatusCard label="AI State" value={aiState} color="text-cyan-400" />
        <StatusCard label="Neural Layer" value="QUANTUM" color="text-green-400" />
        <StatusCard label="Synchronization" value="LIVE" color="text-purple-400" />
        <StatusCard label="Autonomy" value="ABSOLUTE" color="text-fuchsia-400" />
        <StatusCard label="Wave State" value="ENTANGLED" color="text-yellow-400" />

      </div>

    </div>

  )
}

function ThreatPanel({
  alerts,
}) {

  return (

    <div className="border border-zinc-800 bg-zinc-950 rounded-3xl p-6">

      <div className="flex items-center gap-3 mb-6">

        <Siren />

        <h2 className="text-2xl font-bold">
          Threat Feed
        </h2>

      </div>

      <div className="space-y-4 max-h-[500px] overflow-auto">

        {alerts.map((alert, index) => (

          <div
            key={index}
            className="border border-zinc-800 rounded-2xl bg-black p-4"
          >

            <div className="flex items-center justify-between mb-2">

              <div className="font-bold">
                {alert.type}
              </div>

              <div className="text-xs text-zinc-500">
                {alert.priority}
              </div>

            </div>

            <div className="text-sm text-zinc-400">
              {alert.message}
            </div>

          </div>

        ))}

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
