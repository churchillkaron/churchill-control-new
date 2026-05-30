"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function LearningPage() {

  const [
    profile,
    setProfile,
  ] = useState(null);

  async function train() {

    const res =
      await fetch(
        "/api/intelligence/learning/train",
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

    setProfile(
      json.profile
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-5xl font-bold">
            AI Learning Engine
          </h1>

          <div className="text-zinc-500 mt-2">
            Adaptive Business Intelligence
          </div>

        </div>

        <button
          onClick={train}
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Train Profile
        </button>

      </div>

      {profile && (

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-2xl mb-6">
            Learned Business Profile
          </div>

          <pre className="overflow-auto text-sm">
            {JSON.stringify(
              profile,
              null,
              2
            )}
          </pre>

        </div>
      )}

    </div>
  );
}
