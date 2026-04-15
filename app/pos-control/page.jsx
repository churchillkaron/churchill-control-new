'use client'

import { useEffect, useMemo, useState } from 'react'

const THEME = {
  bg: '#0b0b0b',
  panel: '#141414',
  border: '#2a2a2a',
  soft: '#1b1b1b',
  text: '#f5f0e6',
  muted: '#b8aa8a',
  orange: '#d97706',
  khaki: '#c2b280',
  green: '#16a34a',
  red: '#dc2626',
}

function formatTHB(v) {
  return `THB ${Number(v || 0).toLocaleString()}`
}

export default function POSControl() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cost, setCost] = useState('')

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
    <div
      style={{
        minHeight: '100vh',
        background: THEME.bg,
        color: THEME.text,
        padding: '30px',
        fontFamily: 'Arial',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ color: THEME.orange, fontSize: 28, fontWeight: 800 }}>
            CC
          </div>
          <h1 style={{ margin: 0 }}>POS Control</h1>
          <p style={{ color: THEME.muted }}>
            Live profit and margin overview
          </p>
        </div>

        {/* SUMMARY CARDS */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 20,
            marginBottom: 30,
          }}
        >
          <Card title="Revenue Today" value={formatTHB(revenue)} loading={loading} />
          <Card title="Sales" value={summary?.sales || 0} loading={loading} />
          <Card title="Avg Ticket" value={formatTHB(summary?.avg)} loading={loading} />
        </div>

        {/* COST INPUT */}
        <div style={panel}>
          <div style={label}>Daily Cost</div>

          <input
            type="number"
            placeholder="Enter total cost"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            style={input}
          />
        </div>

        {/* PROFIT + MARGIN */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 20,
          }}
        >
          <div style={panel}>
            <div style={label}>Profit</div>
            <div
              style={{
                ...value,
                color: profit >= 0 ? THEME.green : THEME.red,
              }}
            >
              {formatTHB(profit)}
            </div>
          </div>

          <div style={panel}>
            <div style={label}>Margin</div>
            <div style={value}>
              {margin.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* ACTION */}
        <div style={{ marginTop: 30 }}>
          <button onClick={loadData} style={button}>
            Refresh Data
          </button>
        </div>

      </div>
    </div>
  )
}

/* COMPONENTS */

function Card({ title, value, loading }) {
  return (
    <div style={panel}>
      <div style={label}>{title}</div>
      <div style={value}>
        {loading ? 'Loading...' : value}
      </div>
    </div>
  )
}

/* STYLES */

const panel = {
  padding: 20,
  borderRadius: 16,
  background: '#141414',
  border: '1px solid #2a2a2a',
}

const label = {
  color: '#b8aa8a',
  fontSize: 14,
  marginBottom: 8,
}

const value = {
  fontSize: 24,
  fontWeight: 800,
}

const input = {
  width: '100%',
  padding: '12px',
  borderRadius: '12px',
  border: '1px solid #2a2a2a',
  background: '#1b1b1b',
  color: '#f5f0e6',
  fontSize: 16,
}

const button = {
  padding: '12px 18px',
  borderRadius: '12px',
  border: 'none',
  background: '#d97706',
  color: '#111',
  fontWeight: 700,
  cursor: 'pointer',
}