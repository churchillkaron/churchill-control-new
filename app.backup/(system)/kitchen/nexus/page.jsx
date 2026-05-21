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
  Crown,
  Eye,
  Flame,
  Globe,
  Infinity,
  Network,
  Orbit,
  Radar,
 Shield,
  Siren,
  Skull,
  Sparkles,
  Stars,
  Zap,
} from 'lucide-react'

import {
  createKitchenRealtimeChannel,
} from '@/lib/realtime/kitchenRealtimeChannel'

export default function KitchenNexusPage() {

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

        alerts:
          alerts.length,

      }

    }, [queue, alerts])

  const aiState =
    metrics.delayed > 120
      ? 'CHAOS'
      : metrics.urgent > 100
      ? 'OVERDRIVE'
      : 'NEXUS'

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="flex items-center justify-between mb-12">

        <div>

          <h1 className="text-8xl font-black tracking-tight">
            NEXUS
          </h1>

          <p className="text-zinc-500 mt-4 text-2xl">
            Nexus autonomous restaurant intelligence and omniversal synchronization
          </p>

        </div>

        <div className="border border-emerald-400 bg-emerald-950/20 rounded-3xl px-8 py-6">

          <div className="text-emerald-400 text-sm mb-2">
            NEXUS STATUS
          </div>

          <div className="text-5xl font-black">
            SYNCHRONIZED
          </div>

        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-8">

        <MetricCard icon={<ChefHat />} label="Active" value={metrics.active} color="text-blue-400" />
        <MetricCard icon={<Flame />} label="Urgent" value={metrics.urgent} color="text-red-400" />
        <MetricCard icon={<Clock3 />} label="Delayed" value={metrics.delayed} color="text-yellow-400" />
        <MetricCard icon={<AlertTriangle />} label="Rejected" value={metrics.rejected} color="text-pink-400" />
        <MetricCard icon={<Radar />} label="Threats" value={metrics.alerts} color="text-orange-400" />
        <MetricCard icon={<Brain />} label="AI" value={aiState} color="text-cyan-400" />
        <MetricCard icon={<Sparkles />} label="Autonomy" value="∞∞∞∞∞∞∞∞" color="text-fuchsia-400" />
        <MetricCard icon={<Orbit />} label="Governance" value="NEXUS" color="text-green-400" />
        <MetricCard icon={<Infinity />} label="Scale" value="INFINITE" color="text-purple-400" />
        <MetricCard icon={<Skull />} label="Override" value="ULTIMATE" color="text-red-400" />
        <MetricCard icon={<Stars />} label="Reality" value="UNIFIED" color="text-violet-400" />
        <MetricCard icon={<Network />} label="Network" value="CONNECTED" color="text-emerald-300" />

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        <div className="xl:col-span-7 border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

          <div className="flex items-center gap-3 mb-6">

            <Activity />

            <h2 className="text-3xl font-bold">
              Nexus Operations Matrix
            </h2>

          </div>

          <div className="space-y-4 max-h-[950px] overflow-auto">

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

        <div className="xl:col-span-3 border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

          <div className="flex items-center gap-3 mb-6">

            <Siren />

            <h2 className="text-3xl font-bold">
              Threat Intelligence
            </h2>

          </div>

          <div className="space-y-4 max-h-[950px] overflow-auto">

            {alerts.map(
              (
                alert,
                index
              ) => (

                <ThreatCard
                  key={index}
                  alert={alert}
                />
              )
            )}

          </div>

        </div>

        <div className="xl:col-span-2 space-y-6">

          <CorePanel />

          <DefensePanel
            aiState={aiState}
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

      <div className={`text-4xl font-black ${color}`}>
        {value}
      </div>

    </div>

  )
}

function OperationCard({
  item,
}) {

  const critical =
    item.priority === 'URGENT' ||
    item.status === 'DELAYED'

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

        <div>Table: {item.table_number}</div>
        <div>Chef: {item.chef_name}</div>
        <div>Station: {item.station}</div>
        <div>Priority: {item.priority}</div>

      </div>

    </div>

  )
}

function ThreatCard({
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

function CorePanel() {

  return (

    <div className="border border-zinc-800 bg-zinc-950 rounded-3xl p-6">

      <div className="flex items-center gap-3 mb-6">

        <Cpu />

        <h2 className="text-2xl font-bold">
          Nexus Core
        </h2>

      </div>

      <div className="space-y-4">

        <StatusCard label="Consciousness" value="NEXUS" color="text-green-400" />
        <StatusCard label="Neural Matrix" value="∞∞∞∞∞∞∞∞" color="text-cyan-400" />
        <StatusCard label="Prediction" value="CONNECTED" color="text-purple-400" />
        <StatusCard label="Autonomy" value="UNIFIED" color="text-fuchsia-400" />
        <StatusCard label="Reality Layer" value="LOCKED" color="text-violet-400" />

      </div>

    </div>

  )
}

function DefensePanel({
  aiState,
}) {

  return (

    <div className="border border-zinc-800 bg-zinc-950 rounded-3xl p-6">

      <div className="flex items-center gap-3 mb-6">

        <Shield />

        <h2 className="text-2xl font-bold">
          Defense Grid
        </h2>

      </div>

      <div className="space-y-4">

        <StatusCard
          label="AI State"
          value={aiState}
          color={
            aiState === 'NEXUS'
              ? 'text-green-400'
              : aiState === 'OVERDRIVE'
              ? 'text-yellow-400'
              : 'text-red-400'
          }
        />

        <StatusCard label="Protection" value="UNIVERSAL" color="text-blue-400" />
        <StatusCard label="Escalation" value="CONNECTED" color="text-purple-400" />
        <StatusCard label="Governance" value="NEXUS" color="text-fuchsia-400" />
        <StatusCard label="Quantum Layer" value="∞∞∞∞∞∞∞∞" color="text-pink-400" />

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
