'use client'

import { useEffect, useState } from 'react'

export default function PayoutPage() {

  const [data, setData] = useState(null)

  useEffect(() => {
    fetch('/api/staff-payout')
      .then(res => res.json())
      .then(setData)
  }, [])

  if (!data) return <div className="p-6 text-white">Loading...</div>

  return (
    <div className="p-6 text-white space-y-6">

      <h1 className="text-2xl font-bold">STAFF PAYOUT</h1>

      {['FOH', 'BAR', 'KITCHEN'].map(role => (
        <div key={role} className="bg-[#111] p-6 rounded-2xl">

          <h2 className="mb-3 text-lg">{role}</h2>

          {(data[role] || []).map((p, i) => (
            <div key={i} className="flex justify-between text-sm mb-1">
              <span>{p.name}</span>
              <span>THB {p.payout}</span>
            </div>
          ))}

          {(data[role] || []).length === 0 && (
            <p className="text-gray-500 text-sm">No staff</p>
          )}

        </div>
      ))}

    </div>
  )
}
