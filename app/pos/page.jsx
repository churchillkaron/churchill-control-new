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
}

function formatTHB(v) {
  return `THB ${Number(v || 0).toLocaleString()}`
}

function formatTime(v) {
  return new Date(v).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function POSPage() {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchSales = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pos-today')
      const data = await res.json()
      setSales(data.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSales()
  }, [])

  const revenue = useMemo(() => {
    return sales.reduce((sum, s) => sum + Number(s.total || 0), 0)
  }, [sales])

  const avg = useMemo(() => {
    if (!sales.length) return 0
    return revenue / sales.length
  }, [sales, revenue])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: THEME.bg,
        color: THEME.text,
        padding: '30px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* HEADER */}
        <div style={{ marginBottom: '30px' }}>
          <div style={{ color: THEME.orange, fontWeight: 800, fontSize: 28 }}>
            CC
          </div>
          <h1 style={{ margin: 0 }}>Churchill POS Dashboard</h1>
          <p style={{ color: THEME.muted }}>
            Today’s sales overview
          </p>
        </div>

        {/* CARDS */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '20px',
            marginBottom: '30px',
          }}
        >
          <div style={cardStyle}>
            <div style={labelStyle}>Sales</div>
            <div style={valueStyle}>{sales.length}</div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Revenue</div>
            <div style={valueStyle}>{formatTHB(revenue)}</div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Avg Ticket</div>
            <div style={valueStyle}>{formatTHB(avg)}</div>
          </div>
        </div>

        {/* ACTION */}
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={fetchSales}
            style={{
              padding: '10px 18px',
              borderRadius: '12px',
              border: 'none',
              background: THEME.orange,
              color: '#111',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Refresh Sales
          </button>
        </div>

        {/* RECEIPTS */}
        <div style={sectionStyle}>
          <div style={sectionHeader}>
            <h2 style={{ margin: 0 }}>Today’s Receipts</h2>
          </div>

          {loading ? (
            <div style={{ padding: 20 }}>Loading...</div>
          ) : sales.length === 0 ? (
            <div style={{ padding: 20, color: THEME.muted }}>
              No sales yet today.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {sales.map((sale) => (
                <div key={sale.id} style={receiptStyle}>
                  <div>
                    <strong>#{sale.id}</strong>
                  </div>
                  <div style={{ color: THEME.muted }}>
                    {formatTime(sale.created_at)}
                  </div>
                  <div style={{ fontWeight: 700, color: THEME.khaki }}>
                    {formatTHB(sale.total)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* STYLES */

const cardStyle = {
  padding: 20,
  borderRadius: 16,
  background: '#141414',
  border: '1px solid #2a2a2a',
}

const labelStyle = {
  color: '#b8aa8a',
  fontSize: 14,
  marginBottom: 6,
}

const valueStyle = {
  fontSize: 22,
  fontWeight: 800,
}

const sectionStyle = {
  borderRadius: 16,
  background: '#141414',
  border: '1px solid #2a2a2a',
}

const sectionHeader = {
  padding: 20,
  borderBottom: '1px solid #2a2a2a',
}

const receiptStyle = {
  padding: 14,
  borderBottom: '1px solid #2a2a2a',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}