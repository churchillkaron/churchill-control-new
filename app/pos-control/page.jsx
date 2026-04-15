'use client'

import { useEffect, useMemo, useState } from 'react'

export default function POSControl() {
  const [summary, setSummary] = useState(null)
  const [cost, setCost] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/pos-summary')
        const data = await res.json()
        setSummary(data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const revenue = summary?.revenue || 0

  const profit = useMemo(() => {
    return revenue - Number(cost || 0)
  }, [revenue, cost])

  const margin = useMemo(() => {
    if (!revenue) return 0
    return (profit / revenue) * 100
  }, [profit, revenue])

  return (
    <div style={{ padding: 30, background: '#0b0b0b', color: '#fff' }}>
      <h1>POS Control</h1>

      <div style={{ display: 'flex', gap: 20 }}>
        <div>Revenue: {revenue}</div>
        <div>Sales: {summary?.sales || 0}</div>
        <div>Avg: {summary?.avg || 0}</div>
      </div>

      <div style={{ marginTop: 20 }}>
        <input
          type="number"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="Cost"
        />
      </div>

      <div style={{ marginTop: 20 }}>
        <div>Profit: {profit}</div>
        <div>Margin: {margin.toFixed(1)}%</div>
      </div>
    </div>
  )
}