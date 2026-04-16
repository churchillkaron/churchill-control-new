'use client'

import { useEffect, useState } from 'react'

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [staff, setStaff] = useState([])

  useEffect(() => {
    fetch('/api/accounting-summary')
      .then(res => res.json())
      .then(setData)

    fetch('/api/staff-performance')
      .then(res => res.json())
      .then(setStaff)
  }, [])

  if (!data) return <div className="p-6 text-white">Loading...</div>

  const ai = data.ai || {}

  return (
    <div className="p-6 text-white space-y-6">

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#111] p-4 rounded-xl">
          <p>Revenue</p>
          <p className="font-bold">THB {data.revenue}</p>
        </div>
        <div className="bg-[#111] p-4 rounded-xl">
          <p>Sales</p>
          <p className="font-bold">{data.sales}</p>
        </div>
        <div className="bg-[#111] p-4 rounded-xl">
          <p>Avg Ticket</p>
          <p className="font-bold">THB {data.avgTicket}</p>
        </div>
        <div className="bg-[#111] p-4 rounded-xl">
          <p>Drinks/Sale</p>
          <p className="font-bold">{data.drinksPerSale}</p>
        </div>
      </div>

      {/* AI */}
      <div className="bg-[#111] p-6 rounded-2xl border border-red-500">
        <h2>AI MANAGER</h2>
        <div className="text-2xl text-red-500 font-bold">
          {ai.status} ({ai.score})
        </div>

        <div className="mt-3">
          <p className="text-sm text-gray-400">Issues</p>
          {(ai.issues || []).map((i, idx) => (
            <p key={idx}>- {i}</p>
          ))}
        </div>

        <div className="mt-3">
          <p className="text-sm text-gray-400">Commands</p>
          {(ai.commands || []).map((c, idx) => (
            <p key={idx}>⚡ {c}</p>
          ))}
        </div>
      </div>

      {/* SERVICE CHARGE */}
      <div className="bg-[#111] p-6 rounded-2xl border border-yellow-500">
        <h2>SERVICE CHARGE</h2>
        <p className="font-bold">{data.serviceChargeStatus}</p>
        <p>FOH: {data.foh}</p>
        <p>BAR: {data.bar}</p>
        <p>KITCHEN: {data.kitchen}</p>
      </div>

      {/* STAFF PERFORMANCE */}
      <div className="bg-[#111] p-6 rounded-2xl">
        <h2 className="mb-3">STAFF PERFORMANCE</h2>

        <div className="space-y-3">
          {staff.map((s, i) => (
            <div key={i} className="bg-[#1a1a1a] p-4 rounded-xl">
              <div className="flex justify-between">
                <span>{s.name}</span>
                <span>{s.status}</span>
              </div>

              <div className="text-sm text-gray-400">
                THB {s.revenue} • {s.orders} orders • Avg {s.avgTicket}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}