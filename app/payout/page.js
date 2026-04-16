"use client";

import { useEffect, useMemo, useState } from "react";

export default function Payout() {
  const [user, setUser] = useState("");
  const [role, setRole] = useState("");
  const [system, setSystem] = useState(null);
  const [error, setError] = useState("");

  const loadSystem = async () => {
    try {
      const res = await fetch("/api/staff-system", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to load payout system");
        setSystem(null);
      } else {
        setSystem(json);
        setError("");
      }
    } catch {
      setError("Failed to load payout system");
      setSystem(null);
    }
  };

  useEffect(() => {
    setUser(localStorage.getItem("staffName") || "");
    setRole(localStorage.getItem("staffRole") || "");
    loadSystem();
  }, []);

  const currentStaff = useMemo(() => {
    if (!system?.staffWithPayout) return null;
    return system.staffWithPayout.find((s) => s.name === user) || null;
  }, [system, user]);

  return (
    <div className="relative min-h-screen text-white">
      <div className="absolute inset-0 -z-30">
        <img src="/bg-hero-control.jpg" className="w-full h-full object-cover" />
      </div>

      <div className="absolute inset-0 -z-20 bg-black/70" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-16 space-y-10">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 space-y-10">
          <div className="flex justify-between text-sm text-white/60">
            <div>{user}</div>
            <div>{role}</div>
          </div>

          <h1 className="text-2xl">Payout System</h1>

          {error && <p className="text-red-400">{error}</p>}

          {system && (
            <>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-black/40 p-6 rounded-xl">
                  <p>Status</p>
                  <h2 className="text-2xl mt-2">{system.payoutStatus}</h2>
                </div>

                <div className="bg-black/40 p-6 rounded-xl">
                  <p>Payout Level</p>
                  <h2 className="text-2xl mt-2">{system.payoutLevel}%</h2>
                </div>

                <div className="bg-black/40 p-6 rounded-xl">
                  <p>Total Pool</p>
                  <h2 className="text-2xl mt-2">THB {system.payoutPool}</h2>
                </div>
              </div>

              {role !== "Owner" && currentStaff && (
                <div className="bg-black/40 p-6 rounded-xl space-y-3">
                  <p className="text-white/60 text-sm">Your Payroll</p>
                  <h2 className="text-3xl text-[#ffb36b]">
                    THB {currentStaff.payrollAmount}
                  </h2>
                  <p className="text-sm text-white/60">
                    Shift Minutes: {currentStaff.shiftMinutes}
                  </p>
                  <p className="text-sm text-white/60">
                    Full Share: THB {currentStaff.fullPayoutShare}
                  </p>
                </div>
              )}

              {role === "Owner" && (
                <div>
                  <h2 className="text-xl mb-4">Full Staff Payroll</h2>

                  <div className="space-y-3">
                    {system.staffWithPayout.map((s) => (
                      <div
                        key={s.name}
                        className="bg-black/40 p-4 rounded-xl flex justify-between"
                      >
                        <div>
                          <p>{s.name}</p>
                          <p className="text-sm text-white/50">{s.role}</p>
                        </div>

                        <div className="text-right">
                          <p>Score: {s.score}</p>
                          <p className="text-white/60 text-sm">
                            Shift: {s.shiftMinutes} min
                          </p>
                          <p className="text-[#ffb36b]">
                            THB {s.payrollAmount}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}}