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
  red: '#7f1d1d',
  green: '#14532d',
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
  const [loadingSales, setLoadingSales] = useState(false)

  const fetchSales = async () => {
    setLoadingSales(true)
    try {
      const res = await fetch('/api/pos-today')
      const data = await res.json()
      setSales(data.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingSales(false)
    }
  }

  useEffect(() => {
    fetchSales()
  }, [])

  const totalRevenue = useMemo(() => {
    return sales.reduce((sum, s) => sum + Number(s.total || 0), 0)
  }, [sales])

  const avgTicket = useMemo(() => {
    if (!sales.length) return 0
    return totalRevenue / sales.length
  }, [sales, totalRevenue])

  return (
    <div style={{ padding: 20, background: THEME.bg, color: THEME.text }}>
      
      <h1 style={{ color: THEME.orange }}>Churchill POS Dashboard</h1>

      {/* SUMMARY */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
        <div>Sales: {sales.length}</div>
        <div>Revenue: {formatTHB(totalRevenue)}</div>
        <div>Avg Ticket: {formatTHB(avgTicket)}</div>
      </div>

      <button onClick={fetchSales} style={{ marginBottom: 20 }}>
        Refresh
      </button>

      {/* RECEIPTS */}
      <div>
        {loadingSales ? (
          <div>Loading...</div>
        ) : (
          sales.map((sale) => (
            <div
              key={sale.id}
              style={{
                padding: 12,
                marginBottom: 10,
                background: THEME.panel,
                borderRadius: 10,
                border: `1px solid ${THEME.border}`,
              }}
            >
              <div>
                <strong>Receipt #{sale.id}</strong>
              </div>
              <div>{formatTime(sale.created_at)}</div>
              <div>Total: {formatTHB(sale.total)}</div>
            </div>
          ))
        )}
      </div>

    </div>
  )
}