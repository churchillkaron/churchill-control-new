export const dynamic = "force-dynamic";

import { getSystemHealth } from '@/lib/controlCenter/getSystemHealth'

export default async function ControlCenterPage() {

  const health =
    await getSystemHealth()

  const cards = [

    {
      title:
        'System Status',
      value:
        health.system_status,
    },

    {
      title:
        'Live Orders',
      value:
        health.live_orders,
    },

    {
      title:
        'Kitchen Alerts',
      value:
        health.kitchen_alerts,
    },

    {
      title:
        'Occupied Tables',
      value:
        health.occupied_tables,
    },

    {
      title:
        'Low Stock',
      value:
        health.low_stock_alerts,
    },

    {
      title:
        'Unpaid AP',
      value:
        health.unpaid_ap,
    },
  ]

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold">
          Churchill Control Center
        </h1>

        <p className="text-zinc-400 mt-2">
          Enterprise Restaurant Operating System
        </p>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

        {cards.map(card => (

          <div
            key={card.title}
            className="
              bg-white/10
              border
              border-white/10
              rounded-3xl
              backdrop-blur-xl
              p-8
            "
          >

            <div className="text-zinc-400 text-sm">
              {card.title}
            </div>

            <div className="text-5xl font-bold mt-5">
              {card.value}
            </div>

          </div>
        ))}

      </div>

    </div>
  )
}
