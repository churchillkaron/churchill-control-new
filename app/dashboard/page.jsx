'use client'

import { useEffect, useState } from 'react'

export default function DashboardPage() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch('/api/accounting-summary')
      .then(res => res.json())
      .then(setData)
  }, [])

  if (!data) return <div className="p-6 text-white">Loading...</div>

  const ai = data.ai || {}

  return (
    <div className="p-6 text-white space-y-6">

      {/* KPI SECTION */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#111] p-4 rounded-xl">
          <p className="text-sm text-gray-400">Revenue</p>
          <p className="text-xl font-bold">THB {data.revenue || 0}</p>
        </div>

        <div className="bg-[#111] p-4 rounded-xl">
          <p className="text-sm text-gray-400">Sales</p>
          <p className="text-xl font-bold">{data.sales || 0}</p>
        </div>

        <div className="bg-[#111] p-4 rounded-xl">
          <p className="text-sm text-gray-400">Avg Ticket</p>
          <p className="text-xl font-bold">THB {data.avgTicket || 0}</p>
        </div>

        <div className="bg-[#111] p-4 rounded-xl">
          <p className="text-sm text-gray-400">Drinks / Sale</p>
          <p className="text-xl font-bold">{data.drinksPerSale || 0}</p>
        </div>
      </div>

      {/* AI MANAGER */}
      <div className="bg-[#111] p-6 rounded-2xl border border-red-500">

        <h2 className="text-lg text-gray-400 mb-2">AI MANAGER</h2>

        <div className="text-3xl font-bold text-red-500 mb-2">
          {ai.status || 'UNKNOWN'} ({ai.score || 0})
        </div>

        <p className="text-sm text-red-300 mb-4">
          System requires immediate attention
        </p>

        {/* ISSUES */}
        <div className="mb-4">
          <h3 className="text-sm text-gray-400 mb-2">ISSUES</h3>
          <ul className="space-y-1 text-sm">
            {(ai.issues || []).map((issue, i) => (
              <li key={i}>- {issue}</li>
            ))}
          </ul>
        </div>

        {/* COMMANDS */}
        <div>
          <h3 className="text-sm text-gray-400 mb-2">COMMANDS</h3>

          <div className="space-y-2 text-sm">
            {(ai.commands || []).map((cmd, i) => (
              <div key={i} className="bg-[#1a1a1a] p-2 rounded-lg">
                ⚡ {cmd}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SERVICE CHARGE */}
      <div className="bg-[#111] p-6 rounded-2xl border border-yellow-500">

        <h2 className="text-lg text-gray-400 mb-2">SERVICE CHARGE</h2>

        <div className="text-xl font-bold text-yellow-400 mb-2">
          {ai.serviceChargeStatus || 'UNKNOWN'}
        </div>

        <div className="text-sm space-y-1">
          <p>FOH: {ai.foh || 0}</p>
          <p>Bar: {ai.bar || 0}</p>
          <p>Kitchen: {ai.kitchen || 0}</p>
        </div>
      </div>

      {/* HISTORY TABLE */}
      <div className="bg-[#111] p-6 rounded-2xl">
        <h2 className="text-lg text-gray-400 mb-4">HISTORY</h2>

        <div className="text-sm text-gray-400">
          (Use your existing history table here)
        </div>
      </div>

    </div>
  )
}