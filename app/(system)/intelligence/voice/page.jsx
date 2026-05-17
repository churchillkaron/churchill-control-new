"use client";

import { useState } from "react";

export default function VoiceAIPage() {

  const [
    session,
    setSession,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function createSession() {

    setLoading(true);

    try {

      const res =
        await fetch(
          "/api/intelligence/realtime/voice",
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

      setSession(
        json.session || null
      );

    } finally {

      setLoading(false);
    }
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-5xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold">
              Realtime Voice AI
            </h1>

            <div className="text-zinc-500 mt-3">
              OpenAI Executive Voice Agent Infrastructure
            </div>

          </div>

          <button
            onClick={
              createSession
            }
            disabled={loading}
            className="bg-white text-black px-8 py-4 rounded-2xl disabled:opacity-50"
          >
            {loading
              ? "Creating..."
              : "Create Voice Session"}
          </button>

        </div>

        {session && (

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-2xl mb-6">
              Session Created
            </div>

            <pre className="overflow-auto text-sm">
              {JSON.stringify(
                session,
                null,
                2
              )}
            </pre>

          </div>
        )}

      </div>

    </div>
  );
}
