"use client";

import { useEffect, useState } from "react";

export default function AgentHistoryPage() {

  const [
    memories,
    setMemories,
  ] = useState([]);

  useEffect(() => {

    load();

  }, []);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/memory/list",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            tenant_id:
              "demo",
            category:
              "owner_agent",
          }),
        }
      );

    const json =
      await res.json();

    setMemories(
      json.memory || []
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-5xl font-bold mb-10">
        AI Memory History
      </h1>

      <div className="space-y-6">

        {memories.map(
          (
            item,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-xl p-6"
            >

              <div className="text-zinc-500 text-sm mb-4">
                {item.created_at}
              </div>

              <pre className="overflow-auto text-sm">
                {JSON.stringify(
                  item.payload,
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
