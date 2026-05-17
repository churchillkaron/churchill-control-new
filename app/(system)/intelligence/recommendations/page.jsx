"use client";

import { useState } from "react";

export default function RecommendationsPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function loadRecommendations() {

    const res =
      await fetch(
        "/api/intelligence/recommendations",
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

    setData(json);
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-4xl font-bold mb-8">
        AI Recommendations
      </h1>

      <button
        onClick={
          loadRecommendations
        }
        className="bg-white text-black px-6 py-3 rounded-xl"
      >
        Generate Recommendations
      </button>

      <div className="mt-10 space-y-4">

        {data?.recommendations?.map(
          (
            item,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-xl p-6"
            >
              <div className="text-sm text-zinc-400">
                {item.level}
              </div>

              <div className="mt-2 text-lg">
                {item.message}
              </div>
            </div>
          )
        )}

      </div>

    </div>
  );
}
