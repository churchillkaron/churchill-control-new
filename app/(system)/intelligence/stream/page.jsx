"use client";

import { useEffect, useState } from "react";

export default function StreamPage() {

  const [
    events,
    setEvents,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function runStream() {

    setLoading(true);

    try {

      const res =
        await fetch(
          "/api/intelligence/stream/run",
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
        json.streamed_events || []
      );

    } finally {

      setLoading(false);
    }
  }

  useEffect(() => {

    runStream();

    const interval =
      setInterval(
        runStream,
        8000
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

          <h1 className="text-5xl font-bold">
            AI Realtime Stream
          </h1>

          <div className="text-zinc-500 mt-2">
            Continuous Intelligence Event Stream
          </div>

        </div>

        <button
          onClick={
            runStream
          }
          disabled={loading}
          className="bg-white text-black px-6 py-3 rounded-xl disabled:opacity-50"
        >
          {loading
            ? "Streaming..."
            : "Refresh"}
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
                  LIVE
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
