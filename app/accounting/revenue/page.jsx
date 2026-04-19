"use client";

import { useEffect, useState } from "react";
import AppShell from "../../AppShell";

export default function RevenuePage() {
  const [revenue, setRevenue] = useState([]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("revenue") || "[]");
    setRevenue(data);
  }, []);

  const addRevenue = () => {
    if (!amount) return;

    const newItem = {
      id: Date.now(),
      amount: Number(amount),
      note,
      date: new Date().toLocaleDateString("en-GB"),
    };

    const updated = [newItem, ...revenue];

    localStorage.setItem("revenue", JSON.stringify(updated));
    setRevenue(updated);

    setAmount("");
    setNote("");
  };

  const totalRevenue = revenue.reduce((sum, r) => sum + r.amount, 0);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Revenue</h1>

        {/* ADD */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (THB)"
            className="w-full px-4 py-2 rounded bg-black/40 text-white"
          />

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note"
            className="w-full px-4 py-2 rounded bg-black/40 text-white"
          />

          <button
            onClick={addRevenue}
            className="bg-[#ff7a00] px-4 py-2 rounded"
          >
            Add Revenue
          </button>

        </div>

        {/* SUMMARY */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          Total Revenue: THB {totalRevenue.toLocaleString()}
        </div>

        {/* LIST */}
        <div className="space-y-3">

          {revenue.map((r) => (
            <div
              key={r.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between"
            >
              <div>
                <div>{r.note || "Revenue"}</div>
                <div className="text-xs text-white/40">{r.date}</div>
              </div>

              <div className="text-green-400">
                THB {r.amount.toLocaleString()}
              </div>
            </div>
          ))}

          {revenue.length === 0 && (
            <div className="text-white/40">No revenue yet</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}