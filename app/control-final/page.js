"use client";

import { useEffect, useMemo, useState } from "react";

export default function ControlFinal() {
  const [user, setUser] = useState("");
  const [role, setRole] = useState("");
  const [system, setSystem] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadSystem = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/staff-system", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to load staff system");
        setSystem(null);
      } else {
        setSystem(json);
        setError("");
      }
    } catch {
      setError("Failed to load staff system");
      setSystem(null);
    } finally {
      setLoading(false);
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

  const handleClockIn = async () => {
    try {
      const res = await fetch("/api/staff-system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clock_in",
          staffName: user,
          staffRole: role,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Clock in failed");
        return;
      }

      await loadSystem();
    } catch {
      setError("Clock in failed");
    }
  };

  const handleClockOut = async () => {
    try {
      const res = await fetch("/api/staff-system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clock_out",
          staffName: user,
          staffRole: role,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Clock out failed");
        return;
      }

      await loadSystem();
    } catch {
      setError("Clock out failed");
    }
  };

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

          <h1 className="text-2xl">Control Final</h1>

          {loading && <p className="text-white/60">Loading system...</p>}
          {error && <p className="text-red-400">{error}</p>}

          {!loading && system && (
            <>
              <div className="grid md:grid-cols-4 gap-6">
                <div className="bg-black/40 p-6 rounded-xl">
                  <p className="text-white/50 text-sm">Revenue</p>
                  <h2 className="text-2xl mt-2">THB {system.revenue}</h2>
                </div>

                <div className="bg-black/40 p-6 rounded-xl">
                  <p className="text-white/50 text-sm">Service Pool</p>
                  <h2 className="text-2xl mt-2">THB {system.servicePool}</h2>
                </div>

                <div className="bg-black/40 p-6 rounded-xl">
                  <p className="text-white/50 text-sm">Payout Status</p>
                  <h2 className="text-2xl mt-2">{system.payoutStatus}</h2>
                </div>

                <div className="bg-black/40 p-6 rounded-xl">
                  <p className="text-white/50 text-sm">Team Average</p>
                  <h2 className="text-2xl mt-2">{system.averageScore}/100</h2>
                </div>
              </div>

              <div className="bg-black/40 p-6 rounded-xl space-y-4">
                <h2 className="text-lg">Shift Control</h2>

                <div className="flex gap-3">
                  <button
                    onClick={handleClockIn}
                    className="px-4 py-2 bg-green-600 rounded-xl"
                  >
                    Clock In
                  </button>

                  <button
                    onClick={handleClockOut}
                    className="px-4 py-2 bg-red-600 rounded-xl"
                  >
                    Clock Out
                  </button>
                </div>

                {currentStaff && (
                  <>
                    <p className="text-sm text-white/60">
                      Shift Minutes: {currentStaff.shiftMinutes}
                    </p>
                    <p className="text-sm text-white/60">
                      Valid Shift: {currentStaff.validShift ? "Yes" : "No"}
                    </p>
                  </>
                )}
              </div>

              {role === "Owner" && (
                <div>
                  <h2 className="text-xl mb-4">Full Staff Overview</h2>

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

              {role !== "Owner" && currentStaff && (
                <div className="bg-black/40 p-6 rounded-xl">
                  <p>Your Performance</p>
                  <p className="mt-2">Score: {currentStaff.score}</p>
                  <p className="mt-2 text-white/60">
                    Shift: {currentStaff.shiftMinutes} min
                  </p>
                  <p className="text-[#ffb36b] mt-2">
                    Payroll: THB {currentStaff.payrollAmount}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}