"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function ChannelsPage() {

  const [
    members,
    setMembers,
  ] = useState([]);

  const [
    presence,
    setPresence,
  ] = useState([]);

  const clientId =
    "owner-" +
    Math.random()
      .toString(36)
      .substring(7);

  async function join() {

    const res =
      await fetch(
        "/api/realtime/channels",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            action:
              "join",

            channel:
              "executive-room",

            clientId,

            metadata: {

              role:
                "OWNER",
            },
          }),
        }
      );

    const json =
      await res.json();

    setMembers(
      json.members || []
    );

    setPresence(
      json.presence || []
    );
  }

  async function refresh() {

    const res =
      await fetch(
        "/api/realtime/channels?channel=executive-room"
      );

    const json =
      await res.json();

    setMembers(
      json.members || []
    );

    setPresence(
      json.presence || []
    );
  }

  useEffect(() => {

    join();

    const interval =
      setInterval(
        refresh,
        3000
      );

    return () =>
      clearInterval(
        interval
      );

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-5xl mx-auto">

        <h1 className="text-6xl font-bold mb-4">
          Realtime Channels
        </h1>

        <div className="text-zinc-500 mb-10">
          Multi-User Presence & Collaboration Layer
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-2xl mb-6">
              Channel Members
            </div>

            <div className="space-y-4">

              {members.map(
                (
                  member,
                  index
                ) => (

                  <div
                    key={index}
                    className="border border-zinc-800 rounded-xl p-4"
                  >
                    {member}
                  </div>
                )
              )}

            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-2xl mb-6">
              Presence
            </div>

            <div className="space-y-4">

              {presence.map(
                (
                  user,
                  index
                ) => (

                  <div
                    key={index}
                    className="border border-zinc-800 rounded-xl p-4"
                  >

                    <div>
                      {user.userId}
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {user.role}
                    </div>

                    <div className="mt-2 text-green-400">
                      {user.online
                        ? "ONLINE"
                        : "OFFLINE"}
                    </div>

                  </div>
                )
              )}

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
