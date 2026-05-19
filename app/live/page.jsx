import { getLiveOperations } from '@/lib/live/getLiveOperations'

export default async function LivePage() {

  const live =
    await getLiveOperations()

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-5xl font-bold">
          Live Operations Center
        </h1>

        <p className="text-zinc-400 mt-2">
          Real-Time Restaurant Monitoring
        </p>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-10">

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">
          <div className="text-zinc-400 text-sm">
            Revenue
          </div>

          <div className="text-4xl font-bold mt-4">
            ฿{live.revenue}
          </div>
        </div>

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">
          <div className="text-zinc-400 text-sm">
            Live Orders
          </div>

          <div className="text-4xl font-bold mt-4">
            {live.live_orders}
          </div>
        </div>

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">
          <div className="text-zinc-400 text-sm">
            Kitchen Queue
          </div>

          <div className="text-4xl font-bold mt-4">
            {live.kitchen_queue}
          </div>
        </div>

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">
          <div className="text-zinc-400 text-sm">
            Active Staff
          </div>

          <div className="text-4xl font-bold mt-4">
            {live.active_staff}
          </div>
        </div>

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">
          <div className="text-zinc-400 text-sm">
            Occupied Tables
          </div>

          <div className="text-4xl font-bold mt-4">
            {live.occupied_tables}
          </div>
        </div>

      </div>

      <div className="bg-white/10 border border-white/10 rounded-3xl p-6">

        <h2 className="text-2xl font-bold mb-6">
          Live Kitchen Queue
        </h2>

        <div className="space-y-4">

          {live.kitchen_items.map(item => (

            <div
              key={item.id}
              className="
                bg-black/30
                rounded-2xl
                p-4
                flex
                justify-between
                items-center
              "
            >

              <div>

                <div className="font-bold text-lg">
                  {item.dish_name}
                </div>

                <div className="text-zinc-500 text-sm mt-1">
                  Qty: {item.quantity}
                </div>

              </div>

              <div className="text-right">

                <div className="text-yellow-400 font-bold">
                  {item.kitchen_status}
                </div>

              </div>

            </div>
          ))}

        </div>

      </div>

    </div>
  )
}
