"use client";

import { useEffect, useState } from "react";
import { getControlData } from "../../lib/controlLogic";

export default function Payout() {
  const [user, setUser] = useState("");
  const [role, setRole] = useState("");
  const [shift, setShift] = useState(null);

  useEffect(() => {
    setUser(localStorage.getItem("staffName") || "");
    setRole(localStorage.getItem("staffRole") || "");

    const savedShift = localStorage.getItem("shift");
    if (savedShift) {
      setShift(JSON.parse(savedShift));
    }
  }, []);

  const getShiftMinutes = () => {
    if (!shift?.start) return 0;

    const start = new Date(shift.start);
    const end = shift.end ? new Date(shift.end) : new Date();

    return Math.max(0, Math.floor((end - start) / 60000));
  };

  const getDuration = () => {
    const diff = getShiftMinutes();
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    return `${hours}h ${minutes}m`;
  };

  const {
    payoutStatus,
    payoutLevel,
    payoutPool,
    staffWithPayout,
    margin,
  } = getControlData();

  const currentStaff = staffWithPayout.find((s) => s.name === user);

  const shiftMinutes = getShiftMinutes();
  const validShift = !!shift?.valid && shiftMinutes > 0;

  let payrollAmount = 0;

  if (currentStaff && validShift) {
    const fullShiftMinutes = 8 * 60;
    const workedRatio = Math.min(shiftMinutes / fullShiftMinutes, 1);
    payrollAmount = Math.round(currentStaff.payout * workedRatio);
  }

  return (
    <div className="relative min-h-screen text-white">

      {/* BG */}
      <div className="absolute inset-0 -z-30">
        <img src="/bg-hero-control.jpg" className="w-full h-full object-cover" />
      </div>

      <div className="absolute inset-0 -z-20 bg-black/70" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-16 space-y-10">

        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 space-y-10">

          {/* HEADER */}
          <div className="flex justify-between text-sm text-white/60">
            <div>{user}</div>
            <div>{role}</div>
          </div>

          <h1 className="text-2xl">Payout System</h1>

          {/* STATUS */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-black/40 p-6 rounded-xl">
              <p>Status</p>
              <h2>{payoutStatus}</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl">
              <p>Payout Level</p>
              <h2>{payoutLevel}%</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl">
              <p>Margin</p>
              <h2>{margin}%</h2>
            </div>
          </div>

          {/* TOTAL POOL */}
          <div className="bg-black/40 p-6 rounded-xl">
            <p>Total Service Pool</p>
            <h2 className="text-2xl mt-2">THB {payoutPool}</h2>
          </div>

          {/* 🔥 YOUR PAYROLL */}
          {role !== "Owner" && currentStaff && (
            <div className="bg-black/40 p-6 rounded-xl space-y-3">
              <p className="text-white/60 text-sm">Your Payroll</p>

              <h2 className="text-3xl text-[#ffb36b]">
                THB {payrollAmount}
              </h2>

              <p className="text-sm text-white/60">
                Shift: {getDuration()}
              </p>

              <p className="text-sm text-white/60">
                Full Share: THB {currentStaff.payout}
              </p>
            </div>
          )}

          {/* OWNER FULL VIEW */}
          {role === "Owner" && (
            <div>
              <h2 className="text-xl mb-4">Full Staff Payroll</h2>

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
                      <p className="text-[#ffb36b]">
                        THB {s.payout}
                      </p>
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