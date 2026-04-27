"use client";

import { useEffect, useState } from "react";

export default function ProductionApprovalPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const res = await fetch("/api/production/suggestions");
    const data = await res.json();

    setItems(data.suggestions || []);
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (item) => {
    setLoading(true);

    try {
      await fetch("/api/production", {
        method: "POST",
        body: JSON.stringify({
          dish_id: item.dish_id,
          quantity: item.suggested_quantity,
        }),
      });

      await load();
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  };

  return (
    <div className="p-6 text-white max-w-3xl mx-auto">
      <h1 className="text-2xl mb-6">Production Approval</h1>

      {items.length === 0 && (
        <div className="text-white/50">No production needed</div>
      )}

      {items.map((item) => (
        <div
          key={item.dish_id}
          className="bg-white/5 p-4 rounded-xl mb-3 flex justify-between items-center"
        >
          <div>
            <div className="font-semibold">{item.name}</div>

            <div className="text-sm text-yellow-400">
              Stock: {item.current_stock}
            </div>

            <div className="text-sm text-blue-400">
              Suggested: {item.suggested_quantity}
            </div>

            <div className="text-xs text-red-400">
              {item.reason}
            </div>
          </div>

          <button
            onClick={() => approve(item)}
            disabled={loading}
            className="bg-green-500 px-4 py-2 rounded"
          >
            Approve
          </button>
        </div>
      ))}
    </div>
  );
}