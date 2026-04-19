"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function PayoutPage() {
  const [staff, setStaff] = useState([]);
  const [pool, setPool] = useState(0);

  useEffect(() => {
    // 🔹 Get last saved day from History
    const history = JSON.parse(localStorage.getItem("historyDays")) || [];

    if (history.length === 0) return;

    const lastDay = history[history.length - 1];

    const revenue = lastDay.revenue || 0;
    const serviceCharge = revenue * 0.05;

    setPool(serviceCharge);

    // 🔹 TEMP staff (next step we connect real staff system)
    const users = [
      { name: "Anton", role: "gm", score: 100 },
      { name: "Poupee", role: "manager", score: 90 },
      { name: "Dar Dar", role: "accounting", score: 80 },
      { name: "Sara", role: "kitchen", score: 70 },
    ];

    // 🔹 Calculate total score
    const totalScore = users.reduce((sum, u) => sum + u.score, 0);

    // 🔹 Calculate payout
    const result = users.map((u) => {
      const payout =
        totalScore > 0 ? (u.score / totalScore) * serviceCharge : 0;

      return {
        ...u,
        payout,
      };
    });

    setStaff(result);
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Payout</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <div className="text-lg">
            Service Charge Pool: ฿ {pool.toFixed(0)}
          </div>

          <div className="space-y-3">
            {staff.map((s, i) => (
              <div
                key={i}
                className="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between"
              >
                <div>
                  <div>{s.name}</div>
                  <div className="text-white/50 text-sm">{s.role}</div>
                </div>

                <div className="text-orange-400 font-semibold">
                  ฿ {s.payout.toFixed(0)}
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </AppShell>
  );
}