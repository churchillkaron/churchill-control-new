"use client";

import { useEffect, useState } from "react";

export default function MenuAIPage() {
  const [data, setData] = useState([]);

  const load = async () => {
    const res = await fetch("/api/menu-ai");
    const result = await res.json();

    setData(result.analysis || []);
  };

  useEffect(() => {
    load();
  }, []);

  const getColor = (status) => {
    if (status === "BEST_SELLER") return "text-green-400";
    if (status === "POPULAR_LOW_STOCK") return "text-red-400";
    if (status === "LOW_DEMAND") return "text-yellow-400";
    return "text-white/50";
  };

  return (
    <div className="p-6 text-white max-w-5xl mx-auto">
      <h1 className="text-2xl mb-6 font-semibold">Menu AI</h1>

      {data.length === 0 && (
        <div className="text-white/50">No data available</div>
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
                  Sold: {dish.sold} | Revenue: ฿{dish.revenue.toFixed(0)} | Stock: {dish.stock}
                </div>
              </div>

              <div className={`text-sm ${getColor(dish.status)}`}>
                {dish.status}
              </div>
            </div>

            <div className="text-sm mt-2 text-blue-300">
              👉 {dish.action}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}