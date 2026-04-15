'use client';

import { useState, useRef, useEffect } from 'react';

export default function ControlFinal() {
  const [dishes, setDishes] = useState([
    { name: '', qty: '', price: '', cost: '' },
  ]);

  const [message, setMessage] = useState('');
  const inputsRef = useRef([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

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

  function handleEnter(e, row, col) {
    if (e.key !== 'Enter') return;

    e.preventDefault();

    const cols = 4;

    if (col < cols - 1) {
      inputsRef.current[row * cols + col + 1]?.focus();
    } else {
      addDish();
      setTimeout(() => {
        inputsRef.current[(row + 1) * cols]?.focus();
      }, 0);
    }
  }

  function getValidDishes() {
    return dishes.filter(
      (d) =>
        d.name.trim() !== '' &&
        sanitizeNumber(d.qty) > 0
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

  async function saveDay() {
    const valid = getValidDishes();

    if (valid.length === 0) {
      setMessage('Add at least one valid dish');
      return;
    }

    const totals = calculateTotals();

    try {
      const res = await fetch('/api/save-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date().toISOString(),
          dishes: valid,
          revenue: totals.revenue,
          cost: totals.cost,
          profit: totals.profit,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage('Saved successfully');
        setDishes([{ name: '', qty: '', price: '', cost: '' }]);
      } else {
        setMessage('Error saving');
      }
    } catch {
      setMessage('Server error');
    }
  }

  const totals = calculateTotals();

  return (
    <div style={{ padding: 40, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 30 }}>Control Panel</h1>

      {/* TABLE */}
      <table style={{ width: '100%', marginBottom: 30 }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th>Dish</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Cost</th>
            <th>Revenue</th>
            <th>Profit</th>
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
                    placeholder="e.g. Burger"
                    style={{ width: '100%', padding: 8 }}
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
                    style={{ width: 80, padding: 8 }}
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
                    style={{ width: 100, padding: 8 }}
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
                    style={{ width: 100, padding: 8 }}
                  />
                </td>

                <td>{revenue.toFixed(2)}</td>
                <td>{profit.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ACTION */}
      <button
        onClick={addDish}
        style={{ marginBottom: 30 }}
      >
        + Add Dish
      </button>

      {/* TOTALS */}
      <div style={{ marginBottom: 30 }}>
        <h3>Total Revenue: {totals.revenue.toFixed(2)}</h3>
        <h3>Total Cost: {totals.cost.toFixed(2)}</h3>
        <h2>Profit: {totals.profit.toFixed(2)}</h2>
      </div>

      {/* SAVE */}
      <button
        onClick={saveDay}
        style={{
          padding: '12px 24px',
          fontSize: 16,
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        Save Day
      </button>

      {message && (
        <p style={{ marginTop: 10 }}>{message}</p>
      )}
    </div>
  );
}