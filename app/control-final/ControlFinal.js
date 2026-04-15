'use client';

import { useState, useRef } from 'react';

export default function ControlFinal() {
  const [dishes, setDishes] = useState([
    { name: '', qty: '', price: '', cost: '' },
  ]);

  const inputsRef = useRef([]);

  function sanitizeNumber(value) {
    const num = Number(value);
    if (isNaN(num) || num < 0) return 0;
    return num;
  }

  function updateDish(index, field, value) {
    const updated = [...dishes];

    if (field === 'qty' || field === 'price' || field === 'cost') {
      updated[index][field] = value === '' ? '' : Math.max(0, value);
    } else {
      updated[index][field] = value;
    }

    setDishes(updated);
  }

  function addDish() {
    setDishes([...dishes, { name: '', qty: '', price: '', cost: '' }]);
  }

  function removeDish(index) {
    if (dishes.length === 1) return;
    setDishes(dishes.filter((_, i) => i !== index));
  }

  function handleEnter(e, row, col) {
    if (e.key !== 'Enter') return;

    e.preventDefault();

    const cols = 4;

    if (col < cols - 1) {
      inputsRef.current[row * cols + col + 1]?.focus();
    } else {
      if (row === dishes.length - 1) {
        addDish();
        setTimeout(() => {
          inputsRef.current[(row + 1) * cols]?.focus();
        }, 0);
      } else {
        inputsRef.current[(row + 1) * cols]?.focus();
      }
    }
  }

  function getValidDishes() {
    return dishes.filter(
      (d) =>
        d.name.trim() !== '' &&
        sanitizeNumber(d.qty) > 0 &&
        sanitizeNumber(d.price) >= 0
    );
  }

  function calculateTotals() {
    const valid = getValidDishes();

    let revenue = 0;
    let cost = 0;

    valid.forEach((d) => {
      const qty = sanitizeNumber(d.qty);
      const price = sanitizeNumber(d.price);
      const c = sanitizeNumber(d.cost);

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
          {dishes.map((dish, rowIndex) => {
            const qty = sanitizeNumber(dish.qty);
            const price = sanitizeNumber(dish.price);
            const cost = sanitizeNumber(dish.cost);

            const revenue = qty * price;
            const profit = revenue - qty * cost;

            return (
              <tr key={rowIndex}>
                <td>
                  <input
                    ref={(el) =>
                      (inputsRef.current[rowIndex * 4 + 0] = el)
                    }
                    value={dish.name}
                    onChange={(e) =>
                      updateDish(rowIndex, 'name', e.target.value)
                    }
                    onKeyDown={(e) => handleEnter(e, rowIndex, 0)}
                    placeholder="Dish name"
                  />
                </td>

                <td>
                  <input
                    type="number"
                    min="0"
                    ref={(el) =>
                      (inputsRef.current[rowIndex * 4 + 1] = el)
                    }
                    value={dish.qty}
                    onChange={(e) =>
                      updateDish(rowIndex, 'qty', e.target.value)
                    }
                    onKeyDown={(e) => handleEnter(e, rowIndex, 1)}
                  />
                </td>

                <td>
                  <input
                    type="number"
                    min="0"
                    ref={(el) =>
                      (inputsRef.current[rowIndex * 4 + 2] = el)
                    }
                    value={dish.price}
                    onChange={(e) =>
                      updateDish(rowIndex, 'price', e.target.value)
                    }
                    onKeyDown={(e) => handleEnter(e, rowIndex, 2)}
                  />
                </td>

                <td>
                  <input
                    type="number"
                    min="0"
                    ref={(el) =>
                      (inputsRef.current[rowIndex * 4 + 3] = el)
                    }
                    value={dish.cost}
                    onChange={(e) =>
                      updateDish(rowIndex, 'cost', e.target.value)
                    }
                    onKeyDown={(e) => handleEnter(e, rowIndex, 3)}
                  />
                </td>

                <td>{revenue.toFixed(2)}</td>
                <td>{profit.toFixed(2)}</td>

                <td>
                  <button onClick={() => removeDish(rowIndex)}>
                    X
                  </button>
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
    </div>
  );
}