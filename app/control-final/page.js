"use client";

import { useEffect, useState } from "react";

export default function ControlFinal() {
  const [dishes, setDishes] = useState([]);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch("/api/get-dishes")
      .then((res) => res.json())
      .then((data) => {
        setDishes(data);
        setRows(
          data.map((dish) => ({
            id: dish.id,
            name: dish.name,
            price: dish.price,
            cost: dish.cost,
            quantity: 0,
          }))
        );
      });
  }, []);

  const updateQty = (index, value) => {
    const updated = [...rows];
    updated[index].quantity = Number(value);
    setRows(updated);
  };

  const totals = rows.reduce(
    (acc, item) => {
      const revenue = item.price * item.quantity;
      const cost = item.cost * item.quantity;
      const profit = revenue - cost;

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

      <h1 className="text-3xl font-bold mb-6">Daily Control</h1>

      <div className="bg-white rounded-xl shadow overflow-hidden">

        <div className="grid grid-cols-5 bg-gray-200 p-3 font-semibold text-sm">
          <div>Dish</div>
          <div className="text-center">Qty</div>
          <div className="text-right">Revenue</div>
          <div className="text-right">Cost</div>
          <div className="text-right">Profit</div>
        </div>

        {rows.map((item, index) => {
          const revenue = item.price * item.quantity;
          const cost = item.cost * item.quantity;
          const profit = revenue - cost;

          return (
            <div
              key={item.id}
              className="grid grid-cols-5 p-3 border-b items-center"
            >
              <div>{item.name}</div>

              <input
                type="number"
                value={item.quantity}
                onChange={(e) => updateQty(index, e.target.value)}
                className="border rounded px-2 py-1 w-20 mx-auto text-center"
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
      </div>

      <div className="mt-6 bg-white rounded-xl shadow p-4">
        <h2 className="font-semibold mb-2">Totals</h2>
        <p>Revenue: ฿{totals.revenue.toFixed(0)}</p>
        <p>Cost: ฿{totals.cost.toFixed(0)}</p>
        <p className="font-bold text-green-600">
          Profit: ฿{totals.profit.toFixed(0)}
        </p>
      </div>

    </div>
  );
}