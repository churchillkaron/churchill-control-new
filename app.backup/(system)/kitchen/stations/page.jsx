"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import {
  ChefHat,
  Clock3,
  Flame,
  MonitorSmartphone,
} from 'lucide-react'

import {
  createKitchenRealtimeChannel,
} from '@/lib/realtime/kitchenRealtimeChannel'

const STATIONS = [
  'GRILL',
  'FRY',
  'PASTA',
  'SALAD',
  'DESSERT',
  'EXPO',
]

export default function KitchenStationsPage() {

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

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold tracking-tight">
          Kitchen Station Screens
        </h1>

        <p className="text-zinc-500 mt-3 text-lg">
          Real-time production workflow monitoring
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {STATIONS.map(
          station => {

            const stationItems =
              queue.filter(
                item =>
                  item.station ===
                  station
              )

            return (

              <div
                key={station}
                className="border border-zinc-800 rounded-3xl bg-zinc-950 p-5"
              >

                <div className="flex items-center justify-between mb-6">

                  <div className="flex items-center gap-3">

                    <MonitorSmartphone />

                    <div>

                      <div className="text-2xl font-bold">
                        {station}
                      </div>

                      <div className="text-zinc-500 text-sm">
                        Live Station Queue
                      </div>

                    </div>

                  </div>

                  <div className="text-3xl font-bold">
                    {stationItems.length}
                  </div>

                </div>

                <div className="space-y-4 max-h-[700px] overflow-auto">

                  {stationItems.map(
                    item => (

                      <KitchenCard
                        key={item.id}
                        item={item}
                      />
                    )
                  )}

                </div>

              </div>
            )
          }
        )}

      </div>

    </div>
  )
}

function KitchenCard({
  item,
}) {

  const urgent =
    item.priority ===
    'URGENT'

  const delayed =
    item.status ===
    'DELAYED'

  return (

    <div
      className={`
        rounded-2xl border p-4
        ${
          urgent
            ? 'border-red-500 bg-red-950/30'
            : delayed
            ? 'border-yellow-500 bg-yellow-950/20'
            : 'border-zinc-800 bg-black'
        }
      `}
    >

      <div className="flex items-center justify-between mb-4">

        <div className="font-bold text-lg">
          {item.dish_name}
        </div>

        <div className="text-xs text-zinc-400">
          {item.status}
        </div>

      </div>

      <div className="grid grid-cols-2 gap-3 text-sm text-zinc-400 mb-4">

        <div className="flex items-center gap-2">
          <ChefHat size={14} />
          {item.chef_name || '-'}
        </div>

        <div className="flex items-center gap-2">
          <Clock3 size={14} />
          Table {item.table_number || '-'}
        </div>

        <div>
          Qty:
          {' '}
          {item.quantity || 1}
        </div>

        <div className="flex items-center gap-2">

          <Flame
            size={14}
            className={
              urgent
                ? 'text-red-400'
                : 'text-zinc-500'
            }
          />

          {item.priority}
        </div>

      </div>

      {urgent && (

        <div className="text-red-400 text-xs font-bold tracking-wide">
          URGENT PRIORITY
        </div>

      )}

      {delayed && (

        <div className="text-yellow-400 text-xs font-bold tracking-wide mt-1">
          DELAY DETECTED
        </div>

      )}

    </div>
  )
}
