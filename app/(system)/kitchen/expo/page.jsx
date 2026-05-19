'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  BellRing,
  CheckCircle2,
  ChefHat,
  Clock3,
  Flame,
  UtensilsCrossed,
} from 'lucide-react'

import {
  createKitchenRealtimeChannel,
} from '@/lib/realtime/kitchenRealtimeChannel'

export default function KitchenExpoPage() {

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

  const readyItems =
    useMemo(() => {

      return queue.filter(
        item =>
          item.status ===
          'READY'
      )

    }, [queue])

  const activeItems =
    useMemo(() => {

      return queue.filter(
        item =>
          [
            'WAITING',
            'PREPARING',
            'COOKING',
            'PLATING',
          ].includes(
            item.status
          )
      )

    }, [queue])

  const urgentItems =
    useMemo(() => {

      return queue.filter(
        item =>
          item.priority ===
          'URGENT'
      )

    }, [queue])

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-5xl font-bold tracking-tight">
            Expo Control
          </h1>

          <p className="text-zinc-500 mt-3 text-lg">
            Final kitchen pass and dispatch control
          </p>

        </div>

        <div className="flex gap-4">

          <TopStat
            icon={<UtensilsCrossed />}
            label="Active"
            value={activeItems.length}
          />

          <TopStat
            icon={<CheckCircle2 />}
            label="Ready"
            value={readyItems.length}
          />

          <TopStat
            icon={<Flame />}
            label="Urgent"
            value={urgentItems.length}
          />

        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

          <div className="flex items-center gap-3 mb-6">

            <BellRing />

            <h2 className="text-2xl font-semibold">
              Ready For Service
            </h2>

          </div>

          <div className="space-y-4 max-h-[800px] overflow-auto">

            {readyItems.map(
              item => (

                <ReadyCard
                  key={item.id}
                  item={item}
                />
              )
            )}

          </div>

        </div>

        <div className="border border-zinc-800 rounded-3xl bg-zinc-950 p-6">

          <div className="flex items-center gap-3 mb-6">

            <ChefHat />

            <h2 className="text-2xl font-semibold">
              Production Queue
            </h2>

          </div>

          <div className="space-y-4 max-h-[800px] overflow-auto">

            {activeItems.map(
              item => (

                <ProductionCard
                  key={item.id}
                  item={item}
                />
              )
            )}

          </div>

        </div>

      </div>

    </div>
  )
}

function TopStat({
  icon,
  label,
  value,
}) {

  return (

    <div className="border border-zinc-800 rounded-2xl bg-zinc-950 px-5 py-4 min-w-[130px]">

      <div className="flex items-center justify-between mb-3 text-zinc-500">

        <div className="text-sm">
          {label}
        </div>

        {icon}

      </div>

      <div className="text-3xl font-bold">
        {value}
      </div>

    </div>
  )
}

function ReadyCard({
  item,
}) {

  return (

    <div className="border border-green-500 bg-green-950/20 rounded-2xl p-5">

      <div className="flex items-center justify-between mb-4">

        <div className="text-2xl font-bold">
          {item.dish_name}
        </div>

        <div className="text-green-400 text-sm font-bold">
          READY
        </div>

      </div>

      <div className="grid grid-cols-2 gap-4 text-sm text-zinc-300">

        <div>
          Table:
          {' '}
          {item.table_number}
        </div>

        <div>
          Qty:
          {' '}
          {item.quantity}
        </div>

        <div>
          Chef:
          {' '}
          {item.chef_name || '-'}
        </div>

        <div>
          Station:
          {' '}
          {item.station || '-'}
        </div>

      </div>

    </div>
  )
}

function ProductionCard({
  item,
}) {

  const urgent =
    item.priority ===
    'URGENT'

  return (

    <div
      className={`
        rounded-2xl border p-5
        ${
          urgent
            ? 'border-red-500 bg-red-950/20'
            : 'border-zinc-800 bg-black'
        }
      `}
    >

      <div className="flex items-center justify-between mb-4">

        <div className="text-xl font-bold">
          {item.dish_name}
        </div>

        <div className="text-xs text-zinc-400">
          {item.status}
        </div>

      </div>

      <div className="grid grid-cols-2 gap-3 text-sm text-zinc-400">

        <div className="flex items-center gap-2">
          <Clock3 size={14} />
          Table {item.table_number}
        </div>

        <div>
          Qty:
          {' '}
          {item.quantity}
        </div>

        <div>
          Chef:
          {' '}
          {item.chef_name || '-'}
        </div>

        <div>
          Station:
          {' '}
          {item.station || '-'}
        </div>

      </div>

      {urgent && (

        <div className="text-red-400 text-xs font-bold mt-4">
          URGENT PRIORITY
        </div>

      )}

    </div>
  )
}
