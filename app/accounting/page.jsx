'use client'

import { useEffect, useState } from 'react'

export default function AccountingPage() {
  const [expenses, setExpenses] = useState([])
  const [form, setForm] = useState({
    staff: '',
    amount: '',
    category: '',
    department: '',
    note: '',
    file: null
  })

  useEffect(() => {
    fetchExpenses()
  }, [])

  const fetchExpenses = async () => {
    try {
      const res = await fetch('/api/accounting-expenses')
      const data = await res.json()

      // HANDLE BOTH FORMATS
      if (Array.isArray(data)) {
        setExpenses(data)
      } else if (Array.isArray(data.data)) {
        setExpenses(data.data)
      } else {
        setExpenses([])
      }
    } catch (err) {
      console.error('Fetch error:', err)
      setExpenses([])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      const formData = new FormData()
      Object.entries(form).forEach(([key, value]) => {
        if (value) formData.append(key, value)
      })

      await fetch('/api/accounting-expenses', {
        method: 'POST',
        body: formData
      })

      setForm({
        staff: '',
        amount: '',
        category: '',
        department: '',
        note: '',
        file: null
      })

      fetchExpenses()
    } catch (err) {
      console.error('Submit error:', err)
    }
  }

  // SAFE CALCULATIONS
  const total = expenses.reduce(
    (sum, e) => sum + Number(e?.amount || 0),
    0
  )

  return (
    <div className="p-6 text-white space-y-6">

      {/* SUMMARY */}
      <div className="bg-[#111] p-6 rounded-2xl">
        <h2 className="text-lg text-gray-400 mb-4">SUMMARY</h2>
        <p className="text-2xl font-bold">THB {total}</p>
      </div>

      {/* LIST */}
      <div className="bg-[#111] p-6 rounded-2xl">
        <h2 className="text-lg text-gray-400 mb-4">EXPENSES</h2>

        {expenses.length === 0 && (
          <p className="text-gray-500 text-sm">No expenses yet</p>
        )}

        <div className="space-y-3">
          {expenses.map((e, i) => (
            <div key={i} className="bg-[#1a1a1a] p-4 rounded-xl text-sm">
              <div className="flex justify-between">
                <span>{e?.category || 'Unknown'}</span>
                <span>THB {e?.amount || 0}</span>
              </div>

              <div className="text-gray-400 text-xs">
                {e?.staff || '-'} • {e?.department || '-'}
              </div>

              {e?.note && (
                <div className="text-gray-500 text-xs mt-1">
                  {e.note}
                </div>
              )}

              {(e?.image_url || e?.image || e?.file) && (
                <a
                  href={e.image_url || e.image || e.file}
                  target="_blank"
                  className="text-blue-400 text-xs underline block mt-1"
                >
                  View Receipt
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* FORM */}
      <div className="bg-[#111] p-6 rounded-2xl">
        <h2 className="text-lg text-gray-400 mb-4">ADD EXPENSE</h2>

        <form onSubmit={handleSubmit} className="space-y-3">

          <input
            placeholder="Amount"
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            className="w-full p-3 bg-[#1a1a1a] rounded"
          />

          <input
            placeholder="Category"
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
            className="w-full p-3 bg-[#1a1a1a] rounded"
          />

          <input
            placeholder="Department"
            value={form.department}
            onChange={e => setForm({ ...form, department: e.target.value })}
            className="w-full p-3 bg-[#1a1a1a] rounded"
          />

          <textarea
            placeholder="Note"
            value={form.note}
            onChange={e => setForm({ ...form, note: e.target.value })}
            className="w-full p-3 bg-[#1a1a1a] rounded"
          />

          <input
            type="file"
            onChange={e =>
              setForm({ ...form, file: e.target.files[0] })
            }
          />

          <button className="bg-orange-500 w-full py-3 rounded-xl font-bold">
            Save Expense
          </button>
        </form>
      </div>

    </div>
  )
}