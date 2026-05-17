"use client";

import { useEffect, useState } from "react";

import { io } from "socket.io-client";

export default function WebsocketPage() {

  const [
    socket,
    setSocket,
  ] = useState(null);

  const [
    events,
    setEvents,
  ] = useState([]);

  async function initialize() {

    await fetch(
      "/api/realtime/ws",
      {
        method: "POST",
      }
    );

    const client =
      io({

        path:
          "/api/realtime/ws",
      });

    client.on(
      "connect",
      () => {

        client.emit(
          "join-room",
          "executive-room"
        );
      }
    );

    client.on(
      "executive-stream",
      (event) => {

        setEvents(
          (prev) => [

            event,
            ...prev,
          ].slice(
            0,
            50
          )
        );
      }
    );

    setSocket(
      client
    );
  }

  async function sendEvent() {

    if (!socket) {
      return;
    }

    socket.emit(
      "executive-event",
      {

        type:
          "LIVE_EXECUTIVE_ALERT",

        revenue:
          Math.floor(
            Math.random() *
            100000
          ),

        risk:
          "LOW",
      }
    );
  }

  useEffect(() => {

    initialize();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-6xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold">
              Websocket Infrastructure
            </h1>

            <div className="text-zinc-500 mt-3">
              Persistent Enterprise Realtime Layer
            </div>

          </div>

          <button
            onClick={sendEvent}
            className="bg-white text-black px-8 py-4 rounded-2xl"
          >
            Send Event
          </button>

        </div>

        <div className="space-y-6">

          {events.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-2xl p-6"
              >

                <pre className="overflow-auto text-sm">
                  {JSON.stringify(
                    item,
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
