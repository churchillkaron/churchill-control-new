'use client'

import { useEffect, useMemo, useState } from 'react'

export default function ControlFinal() {
  const [posSummary, setPosSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  const [cost, setCost] = useState(0)

  const loadPOS = async () => {
    try {
      const res = await fetch('/api/pos-summary')
      const data = await res.json()
      setPosSummary(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPOS()
  }, [])

  const revenue = posSummary?.revenue || 0

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
        background: '#0b0b0b',
        color: '#f5f0e6',
        padding: '30px',
        fontFamily: 'Arial',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ color: '#d97706', fontWeight: 800, fontSize: 28 }}>
            CC
          </div>
          <h1 style={{ margin: 0 }}>Control Panel</h1>
          <p style={{ color: '#b8aa8a' }}>
            Live profit overview
          </p>
        </div>

        {/* REVENUE */}
        <div style={card}>
          {loading ? (
            <div>Loading POS data...</div>
          ) : (
            <>
              <div style={label}>Revenue Today</div>
              <div style={value}>
                THB {revenue.toLocaleString()}
              </div>
            </>
          )}
        </div>

        {/* COST INPUT */}
        <div style={card}>
          <div style={label}>Enter Daily Cost</div>

          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="Enter total cost"
            style={input}
          />
        </div>

        {/* PROFIT */}
        <div style={card}>
          <div style={label}>Profit</div>
          <div
            style={{
              ...value,
              color: profit >= 0 ? '#16a34a' : '#dc2626',
            }}
          >
            THB {profit.toLocaleString()}
          </div>
        </div>

        {/* MARGIN */}
        <div style={card}>
          <div style={label}>Margin</div>
          <div style={value}>
            {margin.toFixed(1)}%
          </div>
        </div>

      </div>
    </div>
  )
}

/* STYLES */

const card = {
  marginBottom: 20,
  padding: 20,
  borderRadius: 16,
  background: '#141414',
  border: '1px solid #2a2a2a',
}

const label = {
  color: '#b8aa8a',
  fontSize: 14,
  marginBottom: 6,
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