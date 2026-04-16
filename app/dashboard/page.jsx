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

  const revenue = data.revenue || 0
  const sales = data.sales || 0
  const avg = data.avg || 0
  const drinks = data.drinks || 0

  const ai = data.ai || {}

  const score = ai.score || 0
  const status = ai.status || 'UNKNOWN'
  const issues = ai.issues || []
  const decision = ai.decision || ''
  const serviceCharge = ai.serviceCharge || 0
  const split = ai.split || {}

  const statusColor =
    status === 'GOOD'
      ? 'green'
      : status === 'WARNING'
      ? 'orange'
      : status === 'BAD'
      ? 'red'
      : 'black'

  return (
    <div style={{ padding: 20 }}>

      {/* KPI BAR */}
      <h2>KPIs</h2>
      <div>Revenue: {revenue}</div>
      <div>Sales: {sales}</div>
      <div>Avg Ticket: {avg}</div>
      <div>Drinks per Sale: {drinks}</div>

      {/* AI STATUS */}
      <h2 style={{ marginTop: 20 }}>AI Status</h2>
      <div style={{ fontSize: 32, color: statusColor }}>
        {status} ({score})
      </div>

      {/* ISSUES */}
      <h3>Issues</h3>
      {issues.map((issue, i) => (
        <div key={i}>- {issue}</div>
      ))}

      {/* DECISION */}
      <h3 style={{ marginTop: 20 }}>Decision</h3>
      <div>{decision}</div>

      {/* SERVICE CHARGE */}
      <h3 style={{ marginTop: 20 }}>Service Charge</h3>
      <div>Total: {serviceCharge}</div>
      <div>FOH: {split.foh || 0}</div>
      <div>Bar: {split.bar || 0}</div>
      <div>Kitchen: {split.kitchen || 0}</div>

    </div>
  )
}