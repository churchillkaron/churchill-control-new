"use client";

import { useEffect, useState } from "react";

export default function ControlFinal() {
  const [dishes, setDishes] = useState([]);
  const [rows, setRows] = useState([
    { dishId: "", quantity: 0 },
  ]);

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

  const calculateRow = (row) => {
    const dish = getDish(row.dishId);
    if (!dish) return { revenue: 0, cost: 0, profit: 0 };

    const revenue = dish.price * row.quantity;
    const cost = dish.cost * row.quantity;
    const profit = revenue - cost;

    return { revenue, cost, profit };
  };

  const totals = rows.reduce(
    (acc, row) => {
      const { revenue, cost, profit } = calculateRow(row);
      return {
        revenue: acc.revenue + revenue,
        cost: acc.cost + cost,
        profit: acc.profit + profit,
      };
    },
    { revenue: 0, cost: 0, profit: 0 }
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">

      <h1 className="text-2xl font-bold mb-6">Daily Control</h1>

      <div className="bg-white rounded-xl shadow p-4">
        {rows.map((row, index) => {
          const { revenue, cost, profit } = calculateRow(row);

          return (
            <div key={index} className="grid grid-cols-5 gap-3 mb-3">

              <select
                value={row.dishId}
                onChange={(e) =>
                  updateRow(index, "dishId", e.target.value)
                }
                className="border p-2 rounded"
              >
                <option value="">Dish</option>
                {dishes.map((dish) => (
                  <option key={dish.id} value={dish.id}>
                    {dish.name}
                  </option>
                ))}
              </select>

              <input
                type="number"
                value={row.quantity}
                onChange={(e) =>
                  updateRow(index, "quantity", Number(e.target.value))
                }
                className="border p-2 rounded"
              />

              <div>฿{revenue.toFixed(0)}</div>
              <div>฿{cost.toFixed(0)}</div>
              <div>฿{profit.toFixed(0)}</div>
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
        <p>Profit: ฿{totals.profit.toFixed(0)}</p>
      </div>

    </div>
  );
}