"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import {
  AlertTriangle,
  BellRing,
  Clock3,
  Flame,
  ShieldAlert,
} from 'lucide-react'

import {
  createKitchenRealtimeChannel,
} from '@/lib/realtime/kitchenRealtimeChannel'

export default function KitchenAlertsPage() {

  const tenantId =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

  const [
    alerts,
    setAlerts,
  ] = useState([])

  useEffect(() => {

    const channel =
      createKitchenRealtimeChannel({

        tenantId,

        onAlertInsert:
          payload => {

            const incomingAlerts =
              payload.alerts || []

            setAlerts(prev => [
              ...incomingAlerts,
              ...prev,
            ])
          },

      })

    return () => {

      channel.unsubscribe()
    }

  }, [])

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Predictive Alerts
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Real-time operational risk detection engine
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">

        <TopCard
          icon={<ShieldAlert />}
          label="Critical"
          value={
            alerts.filter(
              alert =>
                alert.priority ===
                'CRITICAL'
            ).length
          }
          color="text-red-400"
        />

        <TopCard
          icon={<AlertTriangle />}
          label="High"
          value={
            alerts.filter(
              alert =>
                alert.priority ===
                'HIGH'
            ).length
          }
          color="text-yellow-400"
        />

        <TopCard
          icon={<Clock3 />}
          label="Delayed"
          value={
            alerts.filter(
              alert =>
                alert.type ===
                'DELAYED_TICKET'
            ).length
          }
          color="text-orange-400"
        />

        <TopCard
          icon={<Flame />}
          label="Urgent"
          value={
            alerts.filter(
              alert =>
                alert.type ===
                'URGENT_OVERLOAD'
            ).length
          }
          color="text-pink-400"
        />

      </div>

      <div className="space-y-5">

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

function AlertCard({
  alert,
}) {

  const borderColor =
    alert.priority ===
    'CRITICAL'
      ? 'border-red-500'
      : alert.priority ===
        'HIGH'
      ? 'border-yellow-500'
      : 'border-zinc-800'

  const bgColor =
    alert.priority ===
    'CRITICAL'
      ? 'bg-red-950/20'
      : alert.priority ===
        'HIGH'
      ? 'bg-yellow-950/20'
      : 'bg-zinc-950'

  return (

    <div
      className={`rounded-3xl border p-6 ${borderColor} ${bgColor}`}
    >

      <div className="flex items-center justify-between mb-4">

        <div className="flex items-center gap-3">

          <BellRing />

          <div>

            <div className="text-2xl font-bold">
              {alert.type}
            </div>

            <div className="text-zinc-500 text-sm">
              {alert.priority}
            </div>

          </div>

        </div>

      </div>

      <div className="text-zinc-300 leading-relaxed">

        {alert.message}

      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-6 text-sm text-zinc-400">

        {alert.station && (

          <div>
            Station:
            {' '}
            {alert.station}
          </div>

        )}

        {alert.chef && (

          <div>
            Chef:
            {' '}
            {alert.chef}
          </div>

        )}

        {alert.tableNumber && (

          <div>
            Table:
            {' '}
            {alert.tableNumber}
          </div>

        )}

        {alert.minutesOpen && (

          <div>
            Delay:
            {' '}
            {alert.minutesOpen}m
          </div>

        )}

      </div>

    </div>
  )
}
