"use client";

import { useEffect, useState } from "react";

export default function EventsPage() {

  const [
    events,
    setEvents,
  ] = useState([]);

  async function loadEvents() {

    const res =
      await fetch(
        "/api/intelligence/events/list",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            tenant_id:
              "demo",
          }),
        }
      );

    const json =
      await res.json();

    setEvents(
      json.events || []
    );
  }

  async function createDemoEvent() {

    await fetch(
      "/api/intelligence/events/publish",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          tenant_id:
            "demo",
          type:
            "AI_ANALYSIS_COMPLETED",
          payload: {
            source:
              "copilot",
          },
        }),
      }
    );

    loadEvents();
  }

  useEffect(() => {

    loadEvents();

  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-5xl font-bold">
            Event Bus
          </h1>

          <div className="text-zinc-500 mt-2">
            Distributed Intelligence Events
          </div>

        </div>

        <button
          onClick={
            createDemoEvent
          }
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Publish Event
        </button>

      </div>

      <div className="space-y-4">

        {events.map(
          (
            event,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-2xl p-6"
            >

              <div className="flex items-center justify-between">

                <div className="text-xl">
                  {event.type}
                </div>

                <div className="text-zinc-500 text-sm">
                  {event.created_at}
                </div>

              </div>

              <pre className="mt-4 text-sm overflow-auto">
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
