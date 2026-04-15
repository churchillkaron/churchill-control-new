'use client'

import { useEffect, useMemo, useState } from 'react'

const THEME = {
  bg: '#0b0b0b',
  panel: '#141414',
  border: '#2a2a2a',
  text: '#f5f0e6',
  muted: '#b8aa8a',
  orange: '#d97706',
  green: '#16a34a',
  red: '#dc2626',
}

function formatTHB(v) {
  return `THB ${Number(v || 0).toLocaleString()}`
}

export default function POSControl() {
  const [summary, setSummary] = useState(null)
  const [cost, setCost] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
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

  useEffect(() => {
    loadData()
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
    <div style={{
      minHeight: '100vh',
      background: THEME.bg,
      color: THEME.text,
      padding: 30
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        <h1 style={{ color: THEME.orange }}>POS Control</h1>

        {/* SUMMARY */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
          <Card label="Revenue" value={formatTHB(revenue)} loading={loading} />
          <Card label="Sales" value={summary?.sales || 0} loading={loading} />
          <Card label="Avg Ticket" value={formatTHB(summary?.avg)} loading={loading} />
        </div>

        {/* COST */}
        <div style={panel}>
          <div style={label}>Daily Cost</div>
          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            style={input}
          />
        </div>

        {/* PROFIT */}
        <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
          <div style={panel}>
            <div style={label}>Profit</div>
            <div style={{
              fontSize: 22,
              fontWeight: 800,
              color: profit >= 0 ? THEME.green : THEME.red
            }}>
              {formatTHB(profit)}
            </div>
          </div>

          <div style={panel}>
            <div style={label}>Margin</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {margin.toFixed(1)}%
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

/* COMPONENTS */

function Card({ label, value, loading }) {
  return (
    <div style={panel}>
      <div style={label}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>
        {loading ? '...' : value}
      </div>
    </div>
  )
}

/* STYLES */

const panel = {
  padding: 20,
  borderRadius: 12,
  background: '#141414',
  border: '1px solid #2a2a2a',
}

const label = {
  color: '#b8aa8a',
  fontSize: 14,
  marginBottom: 6,
}

const input = {
  width: '100%',
  padding: 10,
  borderRadius: 10,
  border: '1px solid #2a2a2a',
  background: '#1b1b1b',
  color: '#fff',
}