'use client'

import { useEffect, useMemo, useState } from 'react'

export default function AccountingPage() {

  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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

  async function fetchExpenses() {
    try {
      setLoading(true)

      const res = await fetch('/api/accounting-expenses', {
        cache: 'no-store'
      })

      const data = await res.json()

      if (Array.isArray(data)) {
        setExpenses(data)
      } else if (Array.isArray(data.data)) {
        setExpenses(data.data)
      } else {
        setExpenses([])
      }

    } catch (error) {
      console.error('Fetch error:', error)
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    try {
      setSaving(true)

      const formData = new FormData()
      formData.append('staff', form.staff)
      formData.append('amount', form.amount)
      formData.append('category', form.category)
      formData.append('department', form.department)
      formData.append('note', form.note)

      if (form.file) {
        formData.append('file', form.file)
      }

      const res = await fetch('/api/accounting-expenses', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        throw new Error('Save failed')
      }

      setForm({
        staff: 'John',
        amount: '',
        category: 'General',
        department: 'General',
        note: '',
        file: null
      })

      await fetchExpenses()

    } catch (err) {
      console.error(err)
      alert('Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  // =========================
  // CALCULATIONS
  // =========================

  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  }, [expenses])

  const todayExpenses = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)

    return expenses.reduce((sum, item) => {
      const d = String(item.date || item.created_at || '').slice(0, 10)
      return d === today ? sum + Number(item.amount || 0) : sum
    }, 0)
  }, [expenses])

  const categoryBreakdown = useMemo(() => {
    const map = {}

    expenses.forEach(item => {
      const key = item.category || 'Other'
      map[key] = (map[key] || 0) + Number(item.amount || 0)
    })

    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [expenses])

  function getReceipt(item) {
    return item.image_url || item.image || item.file || item.receipt_url || ''
  }

  // =========================
  // UI
  // =========================

  return (
    <div className="p-6 text-white space-y-6">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold">Churchill Accounting</h1>
        <p className="text-gray-400 text-sm">Owner control system</p>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        <div className="bg-[#111] p-5 rounded-2xl border border-[#222]">
          <p className="text-gray-400 text-sm">Total Expenses</p>
          <p className="text-2xl font-bold">THB {totalExpenses}</p>
        </div>

        <div className="bg-[#111] p-5 rounded-2xl border border-[#222]">
          <p className="text-gray-400 text-sm">Today</p>
          <p className="text-2xl font-bold">THB {todayExpenses}</p>
        </div>

        <div className="bg-[#111] p-5 rounded-2xl border border-[#222]">
          <p className="text-gray-400 text-sm">Entries</p>
          <p className="text-2xl font-bold">{expenses.length}</p>
        </div>

      </div>

      {/* CATEGORY */}
      <div className="bg-[#111] p-6 rounded-2xl border border-[#222]">

        <h2 className="mb-3">Category Breakdown</h2>

        {categoryBreakdown.length === 0 ? (
          <p className="text-gray-500 text-sm">No data</p>
        ) : (
          <div className="space-y-2">
            {categoryBreakdown.map(([cat, val]) => (
              <div key={cat} className="flex justify-between">
                <span>{cat}</span>
                <span>THB {val}</span>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* FORM */}
      <div className="bg-[#111] p-6 rounded-2xl border border-[#222]">

        <h2 className="mb-4">Add Expense</h2>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="grid grid-cols-2 gap-4">

            <input
              value={form.staff}
              onChange={e => setForm({ ...form, staff: e.target.value })}
              placeholder="Staff"
              className="bg-[#1a1a1a] p-3 rounded-xl"
            />

            <input
              type="number"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
              placeholder="Amount"
              className="bg-[#1a1a1a] p-3 rounded-xl"
            />

            <input
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
              placeholder="Category"
              className="bg-[#1a1a1a] p-3 rounded-xl"
            />

            <input
              value={form.department}
              onChange={e => setForm({ ...form, department: e.target.value })}
              placeholder="Department"
              className="bg-[#1a1a1a] p-3 rounded-xl"
            />

          </div>

          <textarea
            value={form.note}
            onChange={e => setForm({ ...form, note: e.target.value })}
            placeholder="Note"
            className="w-full bg-[#1a1a1a] p-3 rounded-xl"
          />

          <input
            type="file"
            onChange={e => setForm({ ...form, file: e.target.files[0] })}
          />

          <button
            type="submit"
            disabled={saving}
            className="bg-orange-500 text-black px-6 py-3 rounded-xl font-bold"
          >
            {saving ? 'Saving...' : 'Save Expense'}
          </button>

        </form>

      </div>

      {/* LIST */}
      <div className="bg-[#111] p-6 rounded-2xl border border-[#222]">

        <h2 className="mb-4">Expense Log</h2>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : expenses.length === 0 ? (
          <p className="text-gray-500">No expenses yet</p>
        ) : (
          <div className="space-y-3">

            {expenses.map((item, i) => {
              const receipt = getReceipt(item)

              return (
                <div key={i} className="bg-[#1a1a1a] p-4 rounded-xl">

                  <div className="flex justify-between">
                    <span>{item.category}</span>
                    <span>THB {item.amount}</span>
                  </div>

                  <p className="text-sm text-gray-400">
                    {item.staff} • {item.department}
                  </p>

                  <p className="text-sm text-gray-500">
                    {item.note}
                  </p>

                  {receipt && (
                    <a
                      href={receipt}
                      target="_blank"
                      className="text-orange-400 text-sm"
                    >
                      View Receipt
                    </a>
                  )}

                </div>
              )
            })}

          </div>
        )}

      </div>

    </div>
  )
}