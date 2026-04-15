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

  // Load expenses
  const loadExpenses = async () => {
    const res = await fetch('/api/accounting-expenses');
    const data = await res.json();
    setExpenses(data || []);
  };

  // Load summary
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

  return (
    <div style={{ padding: 20 }}>
      <h1>Accounting</h1>

      {/* 🔥 FINANCIAL SUMMARY */}
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

      {/* FORM */}
      <div style={{ marginBottom: 30 }}>
        <h2>Add Expense</h2>

        <input name="date" type="date" value={form.date} onChange={handleChange} />
        <input name="category" placeholder="Category" value={form.category} onChange={handleChange} />
        <input name="description" placeholder="Description" value={form.description} onChange={handleChange} />
        <input name="amount" placeholder="Amount" value={form.amount} onChange={handleChange} />
        <input name="payment_method" placeholder="Payment Method" value={form.payment_method} onChange={handleChange} />
        <input name="supplier" placeholder="Supplier" value={form.supplier} onChange={handleChange} />

        <br /><br />

        <button onClick={handleSubmit}>Save Expense</button>
      </div>

      {/* TABLE */}
      <div>
        <h2>Expense List</h2>

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