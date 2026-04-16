'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'

export default function AccountingPage() {
  const [expenses, setExpenses] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [expRes, histRes] = await Promise.all([
          fetch('/api/accounting-expenses'),
          fetch('/api/history')
        ])

        const exp = await expRes.json()
        const hist = await histRes.json()

        setExpenses(Array.isArray(exp) ? exp : [])
        setHistory(Array.isArray(hist) ? hist : [])
      } catch (err) {
        console.error('Accounting load error:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
  const totalRevenue = history.reduce((s, d) => s + Number(d.revenue || 0), 0)
  const totalProfit = history.reduce((s, d) => s + Number(d.profit || 0), 0)

  return (
    <div style={{ padding: 20, color: '#fff', background: '#0b0b0b', minHeight: '100vh' }}>
      <h1>Accounting</h1>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <div style={{ marginBottom: 20 }}>
            <p>Revenue: {totalRevenue}</p>
            <p>Profit: {totalProfit}</p>
            <p>Expenses: {totalExpenses}</p>
            <p>Net: {totalProfit - totalExpenses}</p>
          </div>

          <h3>Expenses</h3>
          {expenses.map((e, i) => (
            <div key={i}>
              {e.category} - {e.amount}
            </div>
          ))}
        </>
      )}
    </div>
  )
}