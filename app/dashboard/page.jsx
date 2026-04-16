'use client'

import { useEffect, useState } from 'react'

export default function Dashboard() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch('/api/accounting-summary')
      .then(res => res.json())
      .then(setData)
      .catch(() => setData(null))
  }, [])

  if (!data) return <div style={{ padding: 20 }}>Loading...</div>

  const ai = data.ai || {}
  const staff = data.staff || []

  const statusColor =
    ai.status === 'GOOD'
      ? 'green'
      : ai.status === 'WARNING'
      ? 'orange'
      : ai.status === 'BAD'
      ? 'red'
      : 'black'

  return (
    <div style={{ padding: 20 }}>

      {/* KPIs */}
      <h2>KPIs</h2>
      <div>Revenue: {data.revenue}</div>
      <div>Sales: {data.sales}</div>
      <div>Avg Ticket: {data.avg}</div>
      <div>Drinks per Sale: {data.drinks}</div>

      {/* AI STATUS */}
      <h2 style={{ marginTop: 20 }}>AI Status</h2>
      <div style={{ fontSize: 28, color: statusColor }}>
        {ai.status} ({ai.score})
      </div>

      {/* ISSUES */}
      <h3>Issues</h3>
      {(ai.issues || []).map((issue, i) => (
        <div key={i}>- {issue}</div>
      ))}

      {/* COMMANDS */}
      <h3 style={{ marginTop: 20 }}>Commands</h3>
      {(ai.commands || []).map((cmd, i) => (
        <div key={i}>⚡ {cmd}</div>
      ))}

      {/* SERVICE CHARGE */}
      <h3 style={{ marginTop: 20 }}>Service Charge</h3>
      <div>Total: {ai.serviceCharge}</div>
      <div>FOH: {ai.split?.foh || 0}</div>
      <div>Bar: {ai.split?.bar || 0}</div>
      <div>Kitchen: {ai.split?.kitchen || 0}</div>

      {/* ========================= */}
      {/* STAFF CONTROL (NEW CORE) */}
      {/* ========================= */}

      <h2 style={{ marginTop: 30 }}>Staff Control</h2>

      {staff.length === 0 && <div>No staff data</div>}

      {staff.map((s, i) => {
        const color =
          s.status === 'GOOD'
            ? 'green'
            : s.status === 'WARNING'
            ? 'orange'
            : s.status === 'BAD'
            ? 'red'
            : 'black'

        return (
          <div
            key={i}
            style={{
              border: '1px solid #ccc',
              padding: 10,
              marginTop: 10
            }}
          >
            <strong>{s.name}</strong>

            <div>Revenue: {s.revenue}</div>
            <div>Sales: {s.sales}</div>
            <div>Drinks: {s.drinks}</div>
            <div>Avg Ticket: {s.avgTicket}</div>

            <div style={{ color, fontWeight: 'bold' }}>
              {s.status} ({s.score})
            </div>

            <div style={{ marginTop: 5 }}>
              {s.commands.map((c, j) => (
                <div key={j}>⚡ {c}</div>
              ))}
            </div>
          </div>
        )
      })}

    </div>
  )
}