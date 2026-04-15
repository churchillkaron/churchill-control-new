'use client'

import { useEffect, useState } from 'react'

export default function ControlFinal() {
  const [posSummary, setPosSummary] = useState(null)
  const [loading, setLoading] = useState(true)

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
            Live business overview
          </p>
        </div>

        {/* POS SUMMARY */}
        <div
          style={{
            marginBottom: 30,
            padding: 20,
            borderRadius: 16,
            background: '#141414',
            border: '1px solid #2a2a2a',
          }}
        >
          {loading ? (
            <div>Loading POS data...</div>
          ) : posSummary ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <strong>Revenue Today:</strong>{' '}
                THB {posSummary.revenue.toLocaleString()}
              </div>
              <div>
                <strong>Sales:</strong> {posSummary.sales}
              </div>
              <div>
                <strong>Avg Ticket:</strong>{' '}
                THB {posSummary.avg.toFixed(0)}
              </div>
            </div>
          ) : (
            <div>No POS data available</div>
          )}
        </div>

        {/* PLACEHOLDER FOR YOUR EXISTING CONTROL LOGIC */}
        <div
          style={{
            padding: 20,
            borderRadius: 16,
            background: '#141414',
            border: '1px solid #2a2a2a',
          }}
        >
          <div style={{ color: '#b8aa8a' }}>
            Your existing control system continues here.
          </div>
        </div>

      </div>
    </div>
  )
}