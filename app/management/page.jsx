import { getManagementOverview } from '@/lib/management/getManagementOverview'

export default async function ManagementPage() {

  const overview =
    await getManagementOverview()

  const cards = [

    {
      title:
        'Active Shifts',
      value:
        overview.active_shifts,
    },

    {
      title:
        'Orders',
      value:
        overview.active_orders,
    },

    {
      title:
        'Kitchen Queue',
      value:
        overview.kitchen_queue,
    },

    {
      title:
        'Occupied Tables',
      value:
        overview.occupied_tables,
    },

    {
      title:
        'Unpaid AP',
      value:
        `฿${overview.unpaid_ap}`,
    },

    {
      title:
        'Waste Cost',
      value:
        `฿${overview.waste_cost}`,
    },
  ]

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Management Command Center
        </h1>

        <p className="text-zinc-400 mt-2">
          Operational Visibility & Control
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
              p-6
            "
          >

            <div className="text-zinc-400 text-sm">
              {card.title}
            </div>

            <div className="text-5xl font-bold mt-4">
              {card.value}
            </div>

          </div>
        ))}

      </div>

    </div>
  )
}
