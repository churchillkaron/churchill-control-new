'use client';

import { useEffect, useState } from 'react';

export default function AccountingPage() {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);

  const [form, setForm] = useState({
    date: '',
    category: '',
    description: '',
    amount: '',
    payment_method: '',
    supplier: '',
  });

  const loadExpenses = async () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .split('T')[0];

    const res = await fetch(`/api/accounting-expenses?start=${start}`);
    const data = await res.json();
    setExpenses(data || []);
  };

  const loadSummary = async () => {
    const res = await fetch('/api/accounting-summary');
    const data = await res.json();
    setSummary(data);
  };

  useEffect(() => {
    loadExpenses();
    loadSummary();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    if (!form.date || !form.amount) return;

    await fetch('/api/accounting-expenses', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount),
      }),
    });

    setForm({
      date: '',
      category: '',
      description: '',
      amount: '',
      payment_method: '',
      supplier: '',
    });

    loadExpenses();
    loadSummary();
  };

  const categoryTotals = {};
  expenses.forEach((e) => {
    const cat = e.category || 'other';
    categoryTotals[cat] =
      (categoryTotals[cat] || 0) + Number(e.amount || 0);
  });

  return (
    <div style={{ padding: 20 }}>
      <h1>Accounting</h1>

      {summary && (
        <div style={{ marginBottom: 30 }}>
          <h2>This Month</h2>

          <div>Revenue: {summary.revenue.toLocaleString()} THB</div>
          <div>Food Cost: {summary.cost.toLocaleString()} THB</div>
          <div>Gross Profit: {summary.grossProfit.toLocaleString()} THB</div>
          <div>Expenses: {summary.expenses.toLocaleString()} THB</div>

          <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 10 }}>
            NET PROFIT: {summary.netProfit.toLocaleString()} THB
          </div>
        </div>
      )}

      <div style={{ marginBottom: 30 }}>
        <h3>Expenses by Category</h3>
        {Object.entries(categoryTotals).map(([cat, val]) => (
          <div key={cat}>
            {cat}: {val.toLocaleString()} THB
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 30 }}>
        <h2>Add Expense</h2>

        <input
          name="date"
          type="date"
          value={form.date}
          onChange={handleChange}
        />

        <select
          name="category"
          value={form.category}
          onChange={handleChange}
        >
          <option value="">Select Category</option>
          <option value="rent">Rent</option>
          <option value="utilities">Utilities</option>
          <option value="salary">Salary</option>
          <option value="supplier">Supplier</option>
          <option value="marketing">Marketing</option>
          <option value="maintenance">Maintenance</option>
          <option value="transport">Transport</option>
          <option value="misc">Misc</option>
        </select>

        <input
          name="description"
          placeholder="Description"
          value={form.description}
          onChange={handleChange}
        />

        <input
          name="amount"
          placeholder="Amount"
          value={form.amount}
          onChange={handleChange}
        />

        <input
          name="payment_method"
          placeholder="Payment Method"
          value={form.payment_method}
          onChange={handleChange}
        />

        <input
          name="supplier"
          placeholder="Supplier"
          value={form.supplier}
          onChange={handleChange}
        />

        <br /><br />

        <button onClick={handleSubmit}>Save Expense</button>
      </div>

      <div>
        <h2>Expense List (This Month)</h2>

        <table border="1" cellPadding="5">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Supplier</th>
              <th>Payment</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>{e.date}</td>
                <td>{e.category}</td>
                <td>{e.description}</td>
                <td>{e.supplier}</td>
                <td>{e.payment_method}</td>
                <td>{Number(e.amount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}