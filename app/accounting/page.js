'use client';

import { useEffect, useState } from 'react';

export default function AccountingPage() {
  const [expenses, setExpenses] = useState([]);
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

  useEffect(() => {
    loadExpenses();
  }, []);

  // Handle form change
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Submit expense
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
  };

  // Calculate totals
  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <div style={{ padding: 20 }}>
      <h1>Accounting</h1>

      {/* SUMMARY */}
      <div style={{ marginBottom: 20 }}>
        <h2>Total Expenses</h2>
        <div style={{ fontSize: 24, fontWeight: 'bold' }}>
          {total.toLocaleString()} THB
        </div>
      </div>

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