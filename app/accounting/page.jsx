'use client'

import { useEffect, useState } from 'react'

export default function AccountingPage() {
  const [expenses, setExpenses] = useState([])
  const [form, setForm] = useState({
    staff: 'John',
    amount: '',
    category: 'General',
    department: 'General',
    note: '',
    file: null
  })

  useEffect(() => {
    fetchExpenses()
  }, [])

  const fetchExpenses = async () => {
    const res = await fetch('/api/accounting-expenses')
    const data = await res.json()
    setExpenses(data || [])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const formData = new FormData()
    Object.keys(form).forEach(key => {
      formData.append(key, form[key])
    })

    await fetch('/api/accounting-expenses', {
      method: 'POST',
      body: formData
    })

    setForm({
      staff: 'John',
      amount: '',
      category: 'General',
      department: 'General',
      note: '',
      file: null
    })

    fetchExpenses()
  }

  // SUMMARY CALCULATION
  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)

  const byCategory = {}
  expenses.forEach(e => {
    const cat = e.category || 'Other'
    byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount || 0)
  })

  return (
    <div className="p-6 text-white space-y-6">

      {/* SUMMARY */}
      <div className="bg-[#111] p-6 rounded-2xl">
        <h2 className="text-lg text-gray-400 mb-4">ACCOUNTING SUMMARY</h2>

        <div className="text-2xl font-bold mb-4">
          Total: THB {total}
        </div>

        <div className="space-y-1 text-sm text-gray-300">
          {Object.entries(byCategory).map(([cat, value]) => (
            <div key={cat}>
              {cat}: THB {value}
            </div>
          ))}
        </div>
      </div>

      {/* EXPENSE LIST */}
      <div className="bg-[#111] p-6 rounded-2xl">
        <h2 className="text-lg text-gray-400 mb-4">EXPENSES</h2>

        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {expenses.map((e, i) => (
            <div key={i} className="bg-[#1a1a1a] p-4 rounded-xl text-sm">
              <div className="flex justify-between">
                <span>{e.category}</span>
                <span>THB {e.amount}</span>
              </div>

              <div className="text-gray-400 text-xs">
                {e.staff} • {e.department}
              </div>

              {e.note && (
                <div className="text-gray-500 text-xs mt-1">
                  {e.note}
                </div>
              )}

              {e.image_url && (
                <a
                  href={e.image_url}
                  target="_blank"
                  className="text-blue-400 text-xs underline mt-1 block"
                >
                  View Receipt
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* UPLOAD FORM */}
      <div className="bg-[#111] p-6 rounded-2xl">
        <h2 className="text-lg text-gray-400 mb-4">UPLOAD EXPENSE</h2>

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
            onChange={e => setForm({ ...form, file: e.target.files[0] })}
          />

          <button className="bg-orange-500 w-full py-3 rounded-xl font-bold">
            Save Expense
          </button>
        </form>
      </div>

    </div>
  )
}