import { getExecutiveMetrics } from '@/lib/dashboard/getExecutiveMetrics'

export default async function DashboardPage() {

  const metrics =
    await getExecutiveMetrics()

  const cards = [

    {
      title:
        'Revenue',
      value:
        `฿${metrics.revenue}`,
    },

    {
      title:
        'Orders',
      value:
        metrics.total_orders,
    },

    {
      title:
        'Active Tables',
      value:
        metrics.active_tables,
    },

    {
      title:
        'Low Stock',
      value:
        metrics.low_stock_alerts,
    },

    {
      title:
        'Pending AP',
      value:
        `฿${metrics.pending_payables}`,
    },

    {
      title:
        'Waste Cost',
      value:
        `฿${metrics.waste_cost}`,
    },
  ]

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Churchill Executive Dashboard
        </h1>

        <p className="text-zinc-400 mt-2">
          Restaurant Operations Control Center
        </p>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

        {cards.map(
          card => (

            <div
              key={card.title}
              className="
                bg-white/10
                border
                border-white/10
                backdrop-blur-xl
                rounded-3xl
                p-6
              "
            >

              <div className="text-zinc-400 text-sm mb-3">
                {card.title}
              </div>

              <div className="text-4xl font-bold">
                {card.value}
              </div>

            </div>
          )
        )}

      </div>

    </div>
  )
}
