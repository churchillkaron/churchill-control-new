"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function RealtimeSyncPage() {

  const [
    events,
    setEvents,
  ] = useState([]);

  async function sendTestEvent() {

    await fetch(
      "/api/realtime/sync",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          type:
            "LIVE_REVENUE_UPDATE",

          payload: {

            revenue:
              Math.floor(
                Math.random() *
                100000
              ),

            timestamp:
              new Date().toISOString(),
          },
        }),
      }
    );
  }

  useEffect(() => {

    const interval =
      setInterval(
        async () => {

          const res =
            await fetch(
              "/api/intelligence/realtime",
              {

                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    tenant_id:
                      "demo",
                  }),
              }
            );

          const json =
            await res.json();

          setEvents(
            (prev) => [

              {

                type:
                  "SNAPSHOT",

                payload:
                  json,

                created_at:
                  new Date().toISOString(),
              },

              ...prev,
            ].slice(
              0,
              20
            )
          );

        },
        5000
      );

    return () =>
      clearInterval(
        interval
      );

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-6xl font-bold">
            Realtime Sync
          </h1>

          <div className="text-zinc-500 mt-3">
            Live Operational Synchronization Layer
          </div>

        </div>

        <button
          onClick={
            sendTestEvent
          }
          className="bg-white text-black px-8 py-4 rounded-2xl"
        >
          Send Test Event
        </button>

      </div>

      <div className="space-y-6">

        {events.map(
          (
            event,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-2xl p-6"
            >

              <div className="flex items-center justify-between mb-4">

                <div className="text-2xl">
                  {event.type}
                </div>

                <div className="text-zinc-500 text-sm">
                  {event.created_at}
                </div>

              </div>

              <pre className="overflow-auto text-sm">
                {JSON.stringify(
                  event.payload,
                  null,
                  2
                )}
              </pre>

            </div>
          )
        )}

      </div>

    </div>
  );
}
