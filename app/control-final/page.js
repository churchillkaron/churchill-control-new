"use client";

import { useEffect, useState } from "react";
import { getControlData } from "../../lib/controlLogic";

export default function ControlFinal() {
  const [user, setUser] = useState("");
  const [role, setRole] = useState("");
  const [shift, setShift] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const name = localStorage.getItem("staffName") || "";
    const role = localStorage.getItem("staffRole") || "";

    setUser(name);
    setRole(role);

    const savedShift = localStorage.getItem("shift");
    if (savedShift) {
      setShift(JSON.parse(savedShift));
    }
  }, []);

  const handleClockIn = () => {
    if (shift && !shift.end) {
      setError("Already clocked in");
      return;
    }

    const newShift = {
      start: new Date().toISOString(),
      end: null,
    };

    localStorage.setItem("shift", JSON.stringify(newShift));
    setShift(newShift);
    setError("");
  };

  const handleClockOut = () => {
    if (!shift || shift.end) {
      setError("You are not clocked in");
      return;
    }

    const updated = {
      ...shift,
      end: new Date().toISOString(),
    };

    localStorage.setItem("shift", JSON.stringify(updated));
    setShift(updated);
    setError("");
  };

  const getDuration = () => {
    if (!shift?.start) return null;

    const start = new Date(shift.start);
    const end = shift.end ? new Date(shift.end) : new Date();

    const diff = Math.floor((end - start) / 60000); // minutes
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;

    return `${hours}h ${minutes}m`;
  };

  const {
    data,
    profit,
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

          {/* 🔥 SHIFT SYSTEM */}
          <div className="bg-black/40 p-6 rounded-xl space-y-4">

            <h2 className="text-lg">Shift Control</h2>

            {!shift?.start && (
              <button
                onClick={handleClockIn}
                className="px-4 py-2 bg-green-600 rounded-xl"
              >
                Clock In
              </button>
            )}

            {shift?.start && !shift?.end && (
              <button
                onClick={handleClockOut}
                className="px-4 py-2 bg-red-600 rounded-xl"
              >
                Clock Out
              </button>
            )}

            {shift?.start && (
              <p className="text-sm text-white/60">
                Start: {new Date(shift.start).toLocaleTimeString()}
              </p>
            )}

            {shift?.end && (
              <p className="text-sm text-white/60">
                End: {new Date(shift.end).toLocaleTimeString()}
              </p>
            )}

            {shift?.start && (
              <p className="text-sm text-[#ffb36b]">
                Duration: {getDuration()}
              </p>
            )}

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

          </div>

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
              <p>Your Performance</p>

              {staffWithPayout
                .filter(s => s.name === user)
                .map((s, i) => (
                  <div key={i}>
                    <p>Score: {s.score}</p>
                    <p className="text-[#ffb36b]">THB {s.payout}</p>
                  </div>
                ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}