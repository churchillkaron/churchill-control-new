"use client";

import { useEffect, useState } from "react";

export default function ProfitPage() {
  const [data, setData] = useState([]);

  const load = async () => {
    const res = await fetch("/api/owner");
    const result = await res.json();

    // 🔥 MERGE + REMOVE DUPLICATES (BEST VERSION)
    const merged = [...(result.top || []), ...(result.worst || [])];

    const unique = Object.values(
      merged.reduce((acc, item) => {
        acc[item.dish_id] = item;
        return acc;
      }, {})
    );

    setData(unique);
  };

  useEffect(() => {
    load();
  }, []);

  const getColor = (margin) => {
    if (margin >= 60) return "text-green-400";
    if (margin >= 30) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div className="p-6 text-white max-w-5xl mx-auto">
      <h1 className="text-2xl mb-6 font-semibold">Profit Analysis</h1>

      {data.length === 0 && (
        <div className="text-white/50">No data</div>
      )}

      <div className="space-y-3">
        {data.map((dish) => (
          <div
            key={dish.dish_id}
            className="bg-white/5 border border-white/10 p-4 rounded-xl"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold">{dish.name}</div>

                <div className="text-sm text-white/50">
                  Sold: {dish.sold}
                </div>

                <div className="text-sm">
                  Revenue: ฿{dish.revenue.toFixed(0)}
                </div>

                <div className="text-sm text-red-400">
                  Cost: ฿{dish.cost.toFixed(0)}
                </div>

                <div className="text-sm text-green-400">
                  Profit: ฿{dish.profit.toFixed(0)}
                </div>
              </div>

              <div
                className={`text-lg font-semibold ${getColor(
                  dish.margin
                )}`}
              >
                {dish.margin}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}