"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import {
  createKitchenRealtimeChannel,
} from '@/lib/realtime/kitchenRealtimeChannel'

export default function KitchenLivePage() {

  const tenantId =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

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
              {
                type:
                  'QUEUE_INSERT',
                data,
              },
              ...prev,
            ])
          },

        onQueueUpdate:
          data => {

            setEvents(prev => [
              {
                type:
                  'QUEUE_UPDATE',
                data,
              },
              ...prev,
            ])
          },

        onTicketUpdate:
          data => {

            setEvents(prev => [
              {
                type:
                  'TICKET_UPDATE',
                data,
              },
              ...prev,
            ])
          },

        onAlertInsert:
          data => {

            setEvents(prev => [
              {
                type:
                  'ALERT',
                data,
              },
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

      <div className="mb-8">

        <h1 className="text-4xl font-bold">
          Kitchen Live Engine
        </h1>

        <p className="text-zinc-400 mt-2">
          Real-time operational stream
        </p>

      </div>

      <div className="space-y-4">

        {events.map(
          (
            event,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-2xl p-4 bg-zinc-950"
            >

              <div className="text-sm text-zinc-500 mb-2">
                {event.type}
              </div>

              <pre className="text-xs overflow-auto">
                {JSON.stringify(
                  event.data,
                  null,
                  2
                )}
              </pre>

            </div>
          )
        )}

      </div>

    </div>
  )
}
