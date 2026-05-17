"use client";

import { useState } from "react";

export default function CouncilPage() {

  const [
    question,
    setQuestion,
  ] = useState("");

  const [
    result,
    setResult,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function runCouncil() {

    setLoading(true);

    try {

      const res =
        await fetch(
          "/api/intelligence/council/run",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              tenant_id:
                "demo",
              question,
            }),
          }
        );

      const json =
        await res.json();

      setResult(json);

    } finally {

      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-5xl font-bold mb-4">
        AI Agent Council
      </h1>

      <div className="text-zinc-500 mb-10">
        Multi-Agent Executive Intelligence System
      </div>

      <div className="flex gap-4 mb-10">

        <input
          value={question}
          onChange={(e) =>
            setQuestion(
              e.target.value
            )
          }
          placeholder="Ask the AI council..."
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4"
        />

        <button
          onClick={
            runCouncil
          }
          disabled={loading}
          className="bg-white text-black px-8 rounded-2xl disabled:opacity-50"
        >
          {loading
            ? "Running..."
            : "Run Council"}
        </button>

      </div>

      {result && (

        <div className="space-y-8">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-2xl mb-6">
              Executive Summary
            </div>

            <div className="whitespace-pre-wrap">
              {result.executive_summary}
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <div className="border border-zinc-800 rounded-2xl p-6">

              <div className="text-xl mb-4">
                Finance AI
              </div>

              <div className="whitespace-pre-wrap text-sm">
                {result.agents?.finance}
              </div>

            </div>

            <div className="border border-zinc-800 rounded-2xl p-6">

              <div className="text-xl mb-4">
                Operations AI
              </div>

              <div className="whitespace-pre-wrap text-sm">
                {result.agents?.operations}
              </div>

            </div>

            <div className="border border-zinc-800 rounded-2xl p-6">

              <div className="text-xl mb-4">
                Strategy AI
              </div>

              <div className="whitespace-pre-wrap text-sm">
                {result.agents?.strategy}
              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}
