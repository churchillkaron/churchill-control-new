import { getOperationalAnalytics } from '@/lib/analytics/getOperationalAnalytics'

export default async function AnalyticsPage() {

  const analytics =
    await getOperationalAnalytics()

  const cards = [

    {
      title:
        'Revenue',
      value:
        `฿${analytics.revenue}`,
    },

    {
      title:
        'Orders',
      value:
        analytics.total_orders,
    },

    {
      title:
        'Average Order',
      value:
        `฿${analytics.average_order_value}`,
    },

    {
      title:
        'Waste Cost',
      value:
        `฿${analytics.waste_cost}`,
    },

    {
      title:
        'Occupied Tables',
      value:
        analytics.occupied_tables,
    },
  ]

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Analytics Command Center
        </h1>

        <p className="text-zinc-400 mt-2">
          Real-Time Restaurant Intelligence
        </p>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">

        {cards.map(card => (

          <div
            key={card.title}
            className="
              bg-white/10
              border
              border-white/10
              rounded-3xl
              backdrop-blur-xl
              p-6
            "
          >

            <div className="text-zinc-400 text-sm">
              {card.title}
            </div>

            <div className="text-4xl font-bold mt-4">
              {card.value}
            </div>

          </div>
        ))}

      </div>

    </div>
  )
}
