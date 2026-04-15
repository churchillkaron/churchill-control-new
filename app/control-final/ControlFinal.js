'use client';

import { useState } from 'react';

export default function ControlFinal() {
  const [dishes, setDishes] = useState([
    { name: '', qty: '', price: '', cost: '' },
  ]);

  function updateDish(index, field, value) {
    const updated = [...dishes];
    updated[index][field] = value;
    setDishes(updated);
  }

  function addDish() {
    setDishes([...dishes, { name: '', qty: '', price: '', cost: '' }]);
  }

  function removeDish(index) {
    if (dishes.length === 1) return;
    setDishes(dishes.filter((_, i) => i !== index));
  }

  function calculateTotals() {
    let revenue = 0;
    let cost = 0;

    dishes.forEach((d) => {
      const qty = Number(d.qty) || 0;
      const price = Number(d.price) || 0;
      const c = Number(d.cost) || 0;

      revenue += qty * price;
      cost += qty * c;
    });

    return {
      revenue,
      cost,
      profit: revenue - cost,
    };
  }

  const totals = calculateTotals();

  return (
    <div style={{ padding: 20 }}>
      <h1>Control Panel</h1>

      <table style={{ width: '100%', marginTop: 20 }}>
        <thead>
          <tr>
            <th>Dish</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Cost</th>
            <th>Revenue</th>
            <th>Profit</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {dishes.map((dish, i) => {
            const qty = Number(dish.qty) || 0;
            const price = Number(dish.price) || 0;
            const cost = Number(dish.cost) || 0;

            const revenue = qty * price;
            const profit = revenue - qty * cost;

            return (
              <tr key={i}>
                <td>
                  <input
                    value={dish.name}
                    onChange={(e) =>
                      updateDish(i, 'name', e.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    type="number"
                    value={dish.qty}
                    onChange={(e) =>
                      updateDish(i, 'qty', e.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    type="number"
                    value={dish.price}
                    onChange={(e) =>
                      updateDish(i, 'price', e.target.value)
                    }
                  />
                </td>

                <td>
                  <input
                    type="number"
                    value={dish.cost}
                    onChange={(e) =>
                      updateDish(i, 'cost', e.target.value)
                    }
                  />
                </td>

                <td>{revenue.toFixed(2)}</td>
                <td>{profit.toFixed(2)}</td>

                <td>
                  <button onClick={() => removeDish(i)}>X</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button onClick={addDish} style={{ marginTop: 10 }}>
        + Add Dish
      </button>

      <div style={{ marginTop: 30 }}>
        <h3>Total Revenue: {totals.revenue.toFixed(2)}</h3>
        <h3>Total Cost: {totals.cost.toFixed(2)}</h3>
        <h2>Profit: {totals.profit.toFixed(2)}</h2>
      </div>

      <button style={{ marginTop: 20 }}>
        Save Day (next step)
      </button>
    </div>
  );
}