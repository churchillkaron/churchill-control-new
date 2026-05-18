"use client";

import { useState } from "react";

import useRealtimePOS from "@/lib/pos/live/useRealtimePOS";

export default function LiveKitchenPage() {

  const [
    events,
    setEvents,
  ] = useState([]);

  useRealtimePOS({

    tenant_id:
      "demo",

    onEvent:
      (event) => {

        setEvents(
          (prev) => [
            event,
            ...prev,
          ]
        );
      },
  });

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-6xl mx-auto">

        <h1 className="text-5xl font-bold mb-4">
          Live Kitchen Feed
        </h1>

        <div className="text-zinc-500 mb-10">
          Realtime Kitchen Synchronization
        </div>

        <div className="space-y-4">

          {events.map(
            (
              event,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-2xl p-5"
              >

                <div className="font-bold text-xl mb-2">
                  {
                    event.event_type
                  }
                </div>

                <pre className="text-sm overflow-auto">
                  {JSON.stringify(
                    event,
                    null,
                    2
                  )}
                </pre>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
