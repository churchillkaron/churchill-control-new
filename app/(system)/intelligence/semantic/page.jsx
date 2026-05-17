"use client";

import { useState } from "react";

export default function SemanticPage() {

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    results,
    setResults,
  ] = useState([]);

  async function search() {

    const res =
      await fetch(
        "/api/intelligence/semantic/search",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            tenant_id:
              "demo",
            query,
          }),
        }
      );

    const json =
      await res.json();

    setResults(
      json.results || []
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-5xl font-bold mb-10">
        Semantic Memory Search
      </h1>

      <div className="flex gap-4 mb-10">

        <input
          value={query}
          onChange={(e) =>
            setQuery(
              e.target.value
            )
          }
          placeholder="Search AI memory..."
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4"
        />

        <button
          onClick={search}
          className="bg-white text-black px-8 rounded-2xl"
        >
          Search
        </button>

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

                <div className="text-zinc-500">
                  Score:
                  {" "}
                  {item.score}
                </div>

                <div className="text-zinc-500 text-sm">
                  {item.created_at}
                </div>

              </div>

              <div className="whitespace-pre-wrap">
                {item.text}
              </div>

            </div>
          )
        )}

      </div>

    </div>
  );
}
