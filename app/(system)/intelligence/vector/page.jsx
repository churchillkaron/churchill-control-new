"use client";

import { useState } from "react";

export default function VectorMemoryPage() {

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    results,
    setResults,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function search() {

    setLoading(true);

    try {

      const res =
        await fetch(
          "/api/intelligence/vector/search",
          {

            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              tenant_id:
                "00000000-0000-0000-0000-000000000000",

              query,
            }),
          }
        );

      const json =
        await res.json();

      setResults(
        json.results || []
      );

    } finally {

      setLoading(false);
    }
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-6xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold">
              PgVector Intelligence
            </h1>

            <div className="text-zinc-500 mt-3">
              Native Semantic Memory & Similarity Search
            </div>

          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

          <div className="flex gap-4">

            <input
              value={query}
              onChange={(e) =>
                setQuery(
                  e.target.value
                )
              }
              placeholder="Search semantic memory..."
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-4 text-white"
            />

            <button
              onClick={search}
              disabled={loading}
              className="bg-white text-black px-8 rounded-xl disabled:opacity-50"
            >
              {loading
                ? "Searching..."
                : "Search"}
            </button>

          </div>

        </div>

        <div className="space-y-6">

          {results.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-2xl p-6"
              >

                <div className="flex items-center justify-between mb-4">

                  <div className="text-zinc-400 text-sm">
                    {item.category}
                  </div>

                  <div className="text-sm text-green-400">
                    Similarity:
                    {" "}
                    {Number(
                      item.similarity || 0
                    ).toFixed(4)}
                  </div>

                </div>

                <div className="text-lg whitespace-pre-wrap">
                  {item.text}
                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
