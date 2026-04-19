"use client";

import { useEffect, useState } from "react";
import AppShell from "../AppShell";

export default function PayoutPage() {
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    const users = [
      { name: "Patric", role: "owner" },
      { name: "Anton", role: "gm" },
      { name: "Poupee", role: "manager" },
      { name: "Dar Dar", role: "accounting" },
      { name: "Sara", role: "kitchen" },
    ];

    const filtered = users.filter((u) => u.role !== "owner");
    setStaff(filtered);
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Payout</h1>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <div className="text-lg">Staff Payout Overview</div>

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

                <div className="text-white/60">
                  — THB
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </AppShell>
  );
}
