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
      const res = await fetch('/api/accounting-expenses', { cache: 'no-store' })
      const data = await res.json()

      if (Array.isArray(data)) {
        setExpenses(data)
      } else if (Array.isArray(data.data)) {
        setExpenses(data.data)
      } else {
        setExpenses([])
      }
    } catch (error) {
      console.error('Failed to fetch expenses:', error)
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
        throw new Error('Failed to save expense')
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
    } catch (error) {
      console.error('Failed to save expense:', error)
      alert('Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, item) => sum + Number(item?.amount || 0), 0)
  }, [expenses])

  const todayExpenses = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)

    return expenses.reduce((sum, item) => {
      const rawDate = item?.date || item?.created_at || ''
      const itemDate = String(rawDate).slice(0, 10)
      return itemDate === today ? sum + Number(item?.amount || 0) : sum
    }, 0)
  }, [expenses])

  const categoryBreakdown = useMemo(() => {
    const map = {}

    expenses.forEach(item => {
      const key = item?.category || 'Uncategorized'
      map[key] = (map[key] || 0) + Number(item?.amount || 0)
    })

    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [expenses])

  function getReceiptUrl(item) {
    return item?.image_url || item?.image || item?.file || item?.receipt_url || ''
  }

  return (
    <div className="p-6 text-white space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Churchill Accounting</h1>
        <p className="text-gray-400 text-sm">Owner control accounting system</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#111] p-5 rounded-2xl border border-[#222]">
          <p className="text-sm text-gray-400 mb-2">Total Expenses</p>
          <p className="text-2xl font-bold">THB {totalExpenses.toLocaleString()}</p>
        </div>

        <div className="bg-[#111] p-5 rounded-2xl border border-[#222]">
          <p className="text-sm text-gray-400 mb-2">Today</p>
          <p className="text-2xl font-bold">THB {todayExpenses.toLocaleString()}</p>
        </div>

        <div className="bg-[#111] p-5 rounded-2xl border border-[#222]">
          <p className="text-sm text-gray-400 mb-2">Expense Entries</p>
          <p className="text-2xl font-bold">{expenses.length}</p>
        </div>
      </div>

      <div className="bg-[#111] p-6 rounded-2xl border border-[#222]">
        <h2 className="text-lg font-semibold mb-4">Category Breakdown</h2>

        {categoryBreakdown.length === 0 ? (
          <p className="text-sm text-gray-500">No expense data yet</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categoryBreakdown.map(([category, value]) => (
              <div
                key={category}
                className="bg-[#1a1a1a] p-4 rounded-xl flex items-center justify-between"
              >
                <span className="text-sm text-gray-300">{category}</span>
                <span className="font-semibold">THB {value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[#111] p-6 rounded-2xl border border-[#222]">
        <h2 className="text-lg font-semibold mb-4">Expense Upload</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={form.staff}
              onChange={(e) => setForm({ ...form, staff: e.target.value })}
              placeholder="Staff"
              className="w-full rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-3 outline-none"
            />

            <input
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="Amount"
              type="number"
              step="0.01"
              className="w-full rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-3 outline-none"
            />

            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Category"
              className="w-full rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-3 outline-none"
            />

            <input
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              placeholder="Department"
              className="w-full rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-3 outline-none"
            />
          </div>

          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Expense note"
            rows={4}
            className="w-full rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-3 outline-none"
          />

          <input
            type="file"
            onChange={(e) =>
              setForm({ ...form, file: e.target.files && e.target.files[0] ? e.target.files[0] : null })
            }
            className="block w-full text-sm text-gray-300"
          />

          <button
            type="submit"
            disabled={saving}
            className="w-full md:w-auto rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-bold px-6 py-3 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Expense'}
          </button>
        </form>
      </div>

      <div className="bg-[#111] p-6 rounded-2xl border border-[#222]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Expense Log</h2>
          <button
            onClick={fetchExpenses}
            className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-2 text-sm"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading expenses...</p>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-gray-500">No expenses yet</p>
        ) : (
          <div className="space-y-3">
            {expenses.map((item, index) => {
              const receiptUrl = getReceiptUrl(item)

              return (
                <div
                  key={item?.id || index}
                  className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">
                          {item?.category || 'Uncategorized'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {item?.department || 'General'}
                        </span>
                      </div>

                      <p className="text-sm text-gray-300">
                        Staff: {item?.staff || '-'}
                      </p>

                      <p className="text-sm text-gray-400">
                        {item?.note || 'No note'}
                      </p>

                      <p className="text-xs text-gray-500">
                        {item?.date || item?.created_at || '-'}
                      </p>
                    </div>

                    <div className="text-left md:text-right space-y-2">
                      <p className="text-xl font-bold">
                        THB {Number(item?.amount || 0).toLocaleString()}
                      </p>

                      {receiptUrl ? (
                        <a
                          href={receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-sm text-orange-400 hover:text-orange-300"
                        >
                          View Receipt
                        </a>
                      ) : (
                        <p className="text-xs text-gray-500">No receipt</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}