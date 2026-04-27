"use client";

import { useEffect, useState } from "react";

export default function MenuDecisionPage() {
  const [data, setData] = useState([]);

  const load = async () => {
    const res = await fetch("/api/menu-decisions");
    const result = await res.json();

    setData(result.decisions || []);
  };

  useEffect(() => {
    load();
  }, []);

  const getColor = (decision) => {
    if (decision === "PUSH") return "text-green-400";
    if (decision === "REMOVE") return "text-red-400";
    if (decision === "IMPROVE") return "text-yellow-400";
    if (decision === "STOP_PRODUCTION") return "text-gray-400";
    return "text-white/50";
  };

  return (
    <div className="p-6 text-white max-w-5xl mx-auto">
      <h1 className="text-2xl mb-6 font-semibold">Menu Decisions</h1>

      {data.length === 0 && (
        <div className="text-white/50">No data</div>
      )}

      <div className="space-y-3">
        {data.map((d, i) => (
          <div
            key={i}
            className="bg-white/5 border border-white/10 p-4 rounded-xl"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold">{d.name}</div>

                <div className="text-sm text-white/50">
                  Sold: {d.sold}
                </div>

                <div className="text-sm">
                  Profit: ฿{d.profit.toFixed(0)} | Margin: {d.margin}%
                </div>
              </div>

              <div className={`font-semibold ${getColor(d.decision)}`}>
                {d.decision}
              </div>
            </div>

            <div className="text-sm mt-2 text-blue-300">
              👉 {d.reason}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}