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

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            Daily Control
          </h1>
          <p className="text-gray-500">
            Enter today’s sales
          </p>
        </div>

        <div className="mt-4 md:mt-0">
          <p className="text-sm text-gray-500">Total Profit</p>
          <p className="text-2xl font-bold text-blue-600">
            ฿{totals.profit.toFixed(2)}
          </p>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl shadow-md overflow-hidden">

        {/* Desktop Header */}
        <div className="hidden md:grid grid-cols-5 bg-gray-50 p-4 text-sm font-semibold text-gray-600">
          <div>Dish</div>
          <div>Qty</div>
          <div>Revenue</div>
          <div>Cost</div>
          <div>Profit</div>
        </div>

        {rows.map((row, index) => {
          const { revenue, cost, profit } = calculateRow(row);

          return (
            <div
              key={index}
              className="grid grid-cols-1 md:grid-cols-5 gap-3 border-t p-4 items-center"
            >
              {/* Dish */}
              <select
                value={row.dishId}
                onChange={(e) =>
                  updateRow(index, "dishId", e.target.value)
                }
                className="border rounded-xl p-3 w-full bg-gray-50"
              >
                <option value="">Select dish</option>
                {dishes.map((dish) => (
                  <option key={dish.id} value={dish.id}>
                    {dish.name}
                  </option>
                ))}
              </select>

              {/* Qty */}
              <input
                type="number"
                value={row.quantity}
                onChange={(e) =>
                  updateRow(index, "quantity", Number(e.target.value))
                }
                className="border rounded-xl p-3 w-full text-lg"
                placeholder="0"
              />

              {/* Revenue */}
              <div className="text-green-600 font-semibold text-lg">
                ฿{revenue.toFixed(0)}
              </div>

              {/* Cost */}
              <div className="text-red-500 text-lg">
                ฿{cost.toFixed(0)}
              </div>

              {/* Profit */}
              <div
                className={`text-lg font-bold ${
                  profit >= 0 ? "text-blue-600" : "text-red-600"
                }`}
              >
                ฿{profit.toFixed(0)}
              </div>
            </div>
          );
        })}

        {/* ADD ROW */}
        <div className="p-4">
          <button
            onClick={addRow}
            className="w-full md:w-auto bg-black text-white px-6 py-3 rounded-xl hover:bg-gray-800 transition"
          >
            + Add Dish
          </button>
        </div>
      </div>

      {/* TOTALS */}
      <div className="mt-6 bg-white rounded-2xl shadow-md p-4 grid grid-cols-3 text-center">
        <div>
          <p className="text-gray-500 text-sm">Revenue</p>
          <p className="text-lg font-bold text-green-600">
            ฿{totals.revenue.toFixed(0)}
          </p>
        </div>

        <div>
          <p className="text-gray-500 text-sm">Cost</p>
          <p className="text-lg font-bold text-red-500">
            ฿{totals.cost.toFixed(0)}
          </p>
        </div>

        <div>
          <p className="text-gray-500 text-sm">Profit</p>
          <p className="text-lg font-bold text-blue-600">
            ฿{totals.profit.toFixed(0)}
          </p>
        </div>
      </div>

    </div>
  );
}