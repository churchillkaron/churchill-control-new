"use client";

import { useState } from "react";

export default function ControlFinal() {
  const [dishes, setDishes] = useState([
    { name: "", price: 0, cost: 0, quantity: 1 },
  ]);

  const menu = [
    { name: "Beef Carpaccio", price: 320, cost: 110 },
    { name: "Chili & Garlic Prawns", price: 320, cost: 74 },
    { name: "Ribeye Steak", price: 890, cost: 206 },
    { name: "Pad Thai", price: 160, cost: 56 },
    { name: "Tom Yum Goong", price: 180, cost: 94 },
  ];

  const addRow = () => {
    setDishes([...dishes, { name: "", price: 0, cost: 0, quantity: 1 }]);
  };

  const updateRow = (i: number, field: string, value: any) => {
    const updated = [...dishes];
    updated[i][field] = value;
    setDishes(updated);
  };

  const selectDish = (i: number, name: string) => {
    const dish = menu.find((d) => d.name === name);
    if (!dish) return;

    updateRow(i, "name", dish.name);
    updateRow(i, "price", dish.price);
    updateRow(i, "cost", dish.cost);
  };

  const totals = dishes.reduce(
    (acc, d) => {
      acc.revenue += d.price * d.quantity;
      acc.cost += d.cost * d.quantity;
      acc.profit += d.price * d.quantity - d.cost * d.quantity;
      return acc;
    },
    { revenue: 0, cost: 0, profit: 0 }
  );

  return (
    <div style={{ padding: 20 }}>
      <h1>Churchill Control</h1>

      {dishes.map((d, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <select
            value={d.name}
            onChange={(e) => selectDish(i, e.target.value)}
          >
            <option value="">Select Dish</option>
            {menu.map((m) => (
              <option key={m.name}>{m.name}</option>
            ))}
          </select>

          <input
            type="number"
            value={d.quantity}
            min={1}
            onChange={(e) => updateRow(i, "quantity", Number(e.target.value))}
          />

          <span> Price: {d.price} </span>
          <span> Cost: {d.cost} </span>
        </div>
      ))}

      <button onClick={addRow}>Add Dish</button>

      <h2>Revenue: {totals.revenue}</h2>
      <h2>Cost: {totals.cost}</h2>
      <h2>Profit: {totals.profit}</h2>
    </div>
  );
}