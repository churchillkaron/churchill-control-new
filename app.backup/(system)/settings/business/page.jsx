"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function BusinessPage() {
  const [name, setName] = useState("Churchill");
  const [currency, setCurrency] = useState("THB");
  const [timezone, setTimezone] = useState("Asia/Bangkok");

  function saveData() {
    alert("Saved locally (Supabase disabled for now)");
  }

  return (
    <div className="min-h-screen bg-[url('/bg-hero-control.jpg')] bg-cover bg-center">
      <div className="min-h-screen bg-black/70 backdrop-blur-sm">

        <div className="pt-20 px-6 max-w-3xl mx-auto text-white">

          <h1 className="text-3xl font-semibold mb-8">Business Settings</h1>

          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 space-y-6">

            <div>
              <label className="text-sm text-white/60">Business Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full bg-white/10 border border-white/10 rounded-lg px-4 py-2 outline-none focus:border-[#ff7a00]"
              />
            </div>

            <div>
              <label className="text-sm text-white/60">Currency</label>
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-2 w-full bg-white/10 border border-white/10 rounded-lg px-4 py-2 outline-none focus:border-[#ff7a00]"
              />
            </div>

            <div>
              <label className="text-sm text-white/60">Timezone</label>
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-2 w-full bg-white/10 border border-white/10 rounded-lg px-4 py-2 outline-none focus:border-[#ff7a00]"
              />
            </div>

            <button
              onClick={saveData}
              className="mt-4 bg-[#ff7a00] text-black px-6 py-2 rounded-lg hover:opacity-90 transition"
            >
              Save
            </button>

          </div>

        </div>

      </div>
    </div>
  );
}