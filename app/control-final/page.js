"use client";

import { useEffect, useState } from "react";
import { getControlData } from "../../lib/controlLogic";

export default function ControlFinal() {
  const [user, setUser] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    setUser(localStorage.getItem("staffName") || "");
    setRole(localStorage.getItem("staffRole") || "");
  }, []);

  const {
    data,
    profit,
    margin,
    payoutStatus,
    payoutLevel,
    staffWithPayout,
  } = getControlData();

  return (
    <div className="relative min-h-screen text-white">

      {/* BG */}
      <div className="absolute inset-0 -z-30">
        <img src="/bg-hero-control.jpg" className="w-full h-full object-cover" />
      </div>

      <div className="absolute inset-0 -z-20 bg-black/70" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-16 space-y-10">

        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 space-y-10">

          {/* USER */}
          <div className="flex justify-between text-sm text-white/60">
            <div>{user}</div>
            <div>{role}</div>
          </div>

          <h1 className="text-2xl">Control Final</h1>

          {/* OWNER VIEW */}
          {role === "Owner" && (
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-black/40 p-6 rounded-xl">
                <p>Revenue</p>
                <h2>{data.revenue}</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl">
                <p>Profit</p>
                <h2>{profit}</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl">
                <p>Status</p>
                <h2>{payoutStatus} ({payoutLevel}%)</h2>
              </div>
            </div>
          )}

          {/* STAFF VIEW */}
          {role !== "Owner" && (
            <div className="bg-black/40 p-6 rounded-xl">
              <p className="text-white/50">Your Performance</p>

              {staffWithPayout
                .filter(s => s.name === user)
                .map((s, i) => (
                  <div key={i}>
                    <p className="mt-2">Score: {s.score}</p>
                    <p className="text-[#ffb36b]">Payout: THB {s.payout}</p>
                  </div>
                ))}
            </div>
          )}

          {/* TEAM (OWNER ONLY) */}
          {role === "Owner" && (
            <div>
              <h2 className="text-xl mb-4">Full Staff Overview</h2>

              <div className="space-y-3">
                {staffWithPayout.map((s, i) => (
                  <div
                    key={i}
                    className="bg-black/40 p-4 rounded-xl flex justify-between"
                  >
                    <div>
                      <p>{s.name}</p>
                      <p className="text-sm text-white/50">{s.role}</p>
                    </div>

                    <div className="text-right">
                      <p>Score: {s.score}</p>
                      <p className="text-[#ffb36b]">THB {s.payout}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}