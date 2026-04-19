"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function PayoutPage() {
  const [staff, setStaff] = useState([]);
  const [name, setName] = useState("");
  const [score, setScore] = useState(1);

  const [revenue, setRevenue] = useState([]);

  useEffect(() => {
    const savedStaff = JSON.parse(localStorage.getItem("staff_scores") || "[]");
    const savedRevenue = JSON.parse(localStorage.getItem("revenue") || "[]");

    setStaff(savedStaff);
    setRevenue(savedRevenue);
  }, []);

  const saveStaff = (data) => {
    setStaff(data);
    localStorage.setItem("staff_scores", JSON.stringify(data));
  };

  const addStaff = () => {
    if (!name) return;

    const newStaff = {
      id: Date.now(),
      name,
      score: Number(score),
    };

    saveStaff([...staff, newStaff]);

    setName("");
    setScore(1);
  };

  const updateScore = (id, value) => {
    const updated = staff.map((s) =>
      s.id === id ? { ...s, score: Number(value) } : s
    );
    saveStaff(updated);
  };

  const totalRevenue = revenue.reduce((sum, r) => sum + r.amount, 0);

  // 🔥 service pool (keep your logic)
  let serviceLevel = 5;
  if (totalRevenue > 200000) serviceLevel = 6;
  if (totalRevenue > 400000) serviceLevel = 7;

  const servicePool = (totalRevenue * serviceLevel) / 100;

  const totalScore = staff.reduce((sum, s) => sum + s.score, 0);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Staff Payout System</h1>

        {/* ADD STAFF */}
        <div className="bg-white/5 p-6 rounded-2xl space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Staff Name"
            className="w-full px-4 py-2 bg-black/40 rounded"
          />

          <input
            type="number"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="Score"
            className="w-full px-4 py-2 bg-black/40 rounded"
          />

          <button
            onClick={addStaff}
            className="bg-[#ff7a00] px-4 py-2 rounded"
          >
            Add Staff
          </button>
        </div>

        {/* SERVICE POOL */}
        <div className="bg-green-500/10 p-6 rounded-2xl">
          <div>Service Pool</div>
          <div className="text-2xl text-green-400">
            THB {servicePool.toLocaleString()}
          </div>
        </div>

        {/* STAFF LIST */}
        <div className="space-y-4">

          {staff.map((s) => {
            const payout =
              totalScore > 0
                ? (servicePool * s.score) / totalScore
                : 0;

            return (
              <div
                key={s.id}
                className="bg-white/5 p-4 rounded-2xl flex justify-between items-center"
              >
                <div>
                  <div>{s.name}</div>
                  <input
                    type="number"
                    value={s.score}
                    onChange={(e) =>
                      updateScore(s.id, e.target.value)
                    }
                    className="mt-2 px-2 py-1 bg-black/40 rounded w-20"
                  />
                </div>

                <div className="text-green-400">
                  THB {payout.toLocaleString()}
                </div>
              </div>
            );
          })}

          {staff.length === 0 && (
            <div className="text-white/40">No staff yet</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}