'use client'

import { useEffect, useState } from 'react'

import {
  AlertTriangle,
  ChefHat,
  Clock3,
  Flame,
  ShieldAlert,
  Trophy,
} from 'lucide-react'

import {
  createKitchenRealtimeChannel,
} from '@/lib/realtime/kitchenRealtimeChannel'

export default function KitchenDashboardPage() {

  const tenantId =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

  const [
    stats,
    setStats,
  ] = useState({

    liveTickets: 0,
    urgentTickets: 0,
    delayedTickets: 0,
    activeChefs: 0,

  })

  const [
    events,
    setEvents,
  ] = useState([])

  useEffect(() => {

    const channel =
      createKitchenRealtimeChannel({

        tenantId,

        onQueueInsert:
          data => {

            setEvents(prev => [
              data,
              ...prev.slice(0, 14),
            ])

            setStats(prev => ({

              ...prev,

              liveTickets:
                prev.liveTickets + 1,

              urgentTickets:
                data.priority ===
                'URGENT'
                  ? prev.urgentTickets + 1
                  : prev.urgentTickets,

            }))
          },

        onQueueUpdate:
          data => {

            if (
              data.status ===
              'DELAYED'
            ) {

              setStats(prev => ({

                ...prev,

                delayedTickets:
                  prev.delayedTickets + 1,

              }))
            }
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
          Kitchen Intelligence
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Real-time kitchen operational command center
        </p>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">

        <DashboardCard
          icon={<ChefHat size={28} />}
          title="Live Tickets"
          value={stats.liveTickets}
        />

        <DashboardCard
          icon={<Flame size={28} />}
          title="Urgent Tickets"
          value={stats.urgentTickets}
        />

        <DashboardCard
          icon={<Clock3 size={28} />}
          title="Delayed Tickets"
          value={stats.delayedTickets}
        />

        <DashboardCard
          icon={<Trophy size={28} />}
          title="Active Chefs"
          value={stats.activeChefs}
        />

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <div className="xl:col-span-2 border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

          <div className="flex items-center gap-3 mb-6">

            <ShieldAlert />

            <h2 className="text-2xl font-semibold">
              Live Operational Stream
            </h2>

          </div>

          <div className="space-y-4 max-h-[700px] overflow-auto">

            {events.map(
              (
                item,
                index
              ) => (

                <div
                  key={index}
                  className="border border-zinc-800 rounded-2xl p-4 bg-black"
                >

                  <div className="flex items-center justify-between mb-3">

                    <div className="font-semibold">
                      {item.dish_name || 'Kitchen Event'}
                    </div>

                    <div className="text-xs text-zinc-500">
                      {item.status}
                    </div>

                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm text-zinc-400">

                    <div>
                      Table:
                      {' '}
                      {item.table_number || '-'}
                    </div>

                    <div>
                      Station:
                      {' '}
                      {item.station || '-'}
                    </div>

                    <div>
                      Chef:
                      {' '}
                      {item.chef_name || '-'}
                    </div>

                    <div>
                      Priority:
                      {' '}
                      {item.priority || '-'}
                    </div>

                  </div>

                </div>
              )
            )}

          </div>

        </div>

        <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

          <div className="flex items-center gap-3 mb-6">

            <AlertTriangle />

            <h2 className="text-2xl font-semibold">
              Operational Status
            </h2>

          </div>

          <div className="space-y-5">

            <StatusCard
              label="Kitchen State"
              value="LIVE"
              color="text-green-400"
            />

            <StatusCard
              label="Realtime Engine"
              value="CONNECTED"
              color="text-blue-400"
            />

            <StatusCard
              label="Predictive Monitoring"
              value="ACTIVE"
              color="text-yellow-400"
            />

            <StatusCard
              label="AI Oversight"
              value="ENABLED"
              color="text-purple-400"
            />

          </div>

        </div>

      </div>

    </div>
  )
}

function DashboardCard({
  icon,
  title,
  value,
}) {

  return (

    <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

      <div className="flex items-center justify-between mb-5">

        <div className="text-zinc-400">
          {title}
        </div>

        <div className="text-zinc-500">
          {icon}
        </div>

      </div>

      <div className="text-5xl font-bold tracking-tight">
        {value}
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

      <div className="text-sm text-zinc-500 mb-2">
        {label}
      </div>

      <div className={`font-bold ${color}`}>
        {value}
      </div>

    </div>
  )
}
