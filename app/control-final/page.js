"use client";

import { useEffect, useState } from "react";

export default function ControlFinal() {
  const [dishes, setDishes] = useState([]);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch("/api/get-dishes")
      .then((res) => res.json())
      .then((data) => setDishes(data));
  }, []);

  const addRow = () => {
    setRows([...rows, { dishId: "", quantity: 0 }]);
  };

  const updateRow = (index, field, value) => {
    const updated = [...rows];
    updated[index][field] = value;
    setRows(updated);
  };

  const getDish = (id) => dishes.find((d) => d.id === id);

  const totals = rows.reduce(
    (acc, row) => {
      const dish = getDish(row.dishId);
      if (!dish) return acc;

      const revenue = dish.price * row.quantity;
      const cost = dish.cost * row.quantity;

      return {
        revenue: acc.revenue + revenue,
        cost: acc.cost + cost,
        profit: acc.profit + (revenue - cost),
      };
    },
    { revenue: 0, cost: 0, profit: 0 }
  );

  return (
    <div className="min-h-screen bg-gray-100 p-6">

      <h1 className="text-3xl font-bold mb-6">Daily Control</h1>

      <div className="bg-white rounded-xl shadow p-4 space-y-3">

        {rows.map((row, index) => {
          const dish = getDish(row.dishId);

          const revenue = dish ? dish.price * row.quantity : 0;
          const cost = dish ? dish.cost * row.quantity : 0;
          const profit = revenue - cost;

          return (
            <div key={index} className="grid grid-cols-5 gap-3 items-center">

              <select
                value={row.dishId}
                onChange={(e) =>
                  updateRow(index, "dishId", e.target.value)
                }
                className="border p-2 rounded"
              >
                <option value="">Select dish</option>
                {dishes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              <input
                type="number"
                value={row.quantity}
                onChange={(e) =>
                  updateRow(index, "quantity", Number(e.target.value))
                }
                className="border p-2 rounded text-center"
              />

              <div className="text-right">
                ฿{revenue.toFixed(0)}
              </div>

              <div className="text-right text-gray-500">
                ฿{cost.toFixed(0)}
              </div>

              <div className="text-right font-semibold text-green-600">
                ฿{profit.toFixed(0)}
              </div>
            </div>
          );
        })}

        <button
          onClick={addRow}
          className="mt-4 bg-black text-white px-4 py-2 rounded"
        >
          + Add Dish
        </button>
      </div>

      <div className="mt-6 bg-white p-4 rounded shadow">
        <p>Revenue: ฿{totals.revenue.toFixed(0)}</p>
        <p>Cost: ฿{totals.cost.toFixed(0)}</p>
        <p className="font-bold text-green-600">
          Profit: ฿{totals.profit.toFixed(0)}
        </p>
      </div>

    </div>
  );
}