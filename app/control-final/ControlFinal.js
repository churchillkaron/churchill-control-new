'use client';

import { useState, useRef, useEffect } from 'react';

const DISH_PRESETS = [
  { name: "Ribeye Steak", price: 650, cost: 380 },
  { name: "Pad Thai", price: 180, cost: 90 },
  { name: "Green Curry", price: 220, cost: 110 },
  { name: "Burger", price: 250, cost: 120 },
];

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

    if (field === 'qty') {
      updated[index][field] = value === '' ? '' : Math.max(0, value);
    } else {
      updated[index][field] = value;
    }

    setDishes(updated);
  }

  function selectDish(index, name) {
    const preset = DISH_PRESETS.find(d => d.name === name);

    const updated = [...dishes];

    if (preset) {
      updated[index] = {
        ...updated[index],
        name: preset.name,
        price: preset.price,
        cost: preset.cost
      };
    }

    setDishes(updated);
  }

  function addDish() {
    setDishes([...dishes, { name: '', qty: '', price: '', cost: '' }]);
  }

  function calculateTotals() {
    let revenue = 0;
    let cost = 0;

    dishes.forEach(d => {
      const qty = sanitizeNumber(d.qty);
      const price = sanitizeNumber(d.price);
      const c = sanitizeNumber(d.cost);

      revenue += qty * price;
      cost += qty * c;
    });

    return {
      revenue,
      cost,
      profit: revenue - cost
    };
  }

  async function saveDay() {
    const totals = calculateTotals();

    try {
      const res = await fetch('/api/save-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date().toISOString(),
          dishes,
          revenue: totals.revenue,
          cost: totals.cost,
          profit: totals.profit,
        }),
      });

      const data = await res.json();

      setMessage(data.success ? 'Saved successfully' : 'Error saving');
    } catch {
      setMessage('Server error');
    }
  }

  const totals = calculateTotals();

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Control Panel</h1>

        <div style={styles.card}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>Dish</th>
                <th>Qty</th>
                <th>Revenue</th>
                <th>Profit</th>
              </tr>
            </thead>

            <tbody>
              {dishes.map((dish, i) => {
                const qty = sanitizeNumber(dish.qty);
                const revenue = qty * dish.price;
                const profit = revenue - qty * dish.cost;

                return (
                  <tr key={i}>
                    <td>
                      <select
                        value={dish.name}
                        onChange={(e) => selectDish(i, e.target.value)}
                        style={styles.input}
                      >
                        <option value="">Select</option>
                        {DISH_PRESETS.map(d => (
                          <option key={d.name}>{d.name}</option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <input
                        type="number"
                        value={dish.qty}
                        onChange={(e) =>
                          updateDish(i, 'qty', e.target.value)
                        }
                        style={styles.input}
                      />
                    </td>

                    <td>{revenue.toFixed(2)}</td>
                    <td>{profit.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button onClick={addDish} style={styles.button}>
            + Add Dish
          </button>
        </div>

        <div style={styles.card}>
          <h3>Total Revenue: {totals.revenue.toFixed(2)}</h3>
          <h3>Total Cost: {totals.cost.toFixed(2)}</h3>
          <h2>Profit: {totals.profit.toFixed(2)}</h2>
        </div>

        <button onClick={saveDay} style={styles.save}>
          Save Day
        </button>

        {message && <p>{message}</p>}
      </div>
    </div>
  );
}

const styles = {
  page: {
    background: '#f5f1e6',
    minHeight: '100vh',
    padding: 40
  },
  container: {
    maxWidth: 900,
    margin: '0 auto'
  },
  title: {
    marginBottom: 20
  },
  card: {
    background: '#fff',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20
  },
  table: {
    width: '100%',
    marginBottom: 10
  },
  input: {
    padding: 8,
    width: '100%'
  },
  button: {
    marginTop: 10
  },
  save: {
    padding: '10px 20px',
    fontWeight: 'bold'
  }
};