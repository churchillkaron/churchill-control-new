import { getKitchenQueue } from '@/lib/kitchen/getKitchenQueue'

export default async function KitchenPage() {

  const queue =
    await getKitchenQueue()

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Kitchen Control Center
        </h1>

        <p className="text-zinc-400 mt-2">
          Live Kitchen Operations
        </p>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {queue.map(item => (

          <div
            key={item.id}
            className="
              bg-white/10
              border
              border-white/10
              rounded-3xl
              backdrop-blur-xl
              p-6
            "
          >

            <div className="flex items-center justify-between mb-4">

              <div>

                <div className="text-2xl font-bold">
                  {item.dish_name}
                </div>

                <div className="text-zinc-400 text-sm mt-1">
                  Qty: {item.quantity}
                </div>

              </div>

              <div
                className={`
                  px-4 py-2 rounded-full text-sm font-bold

                  ${
                    item.sla === 'GOOD'
                      ? 'bg-green-500/20 text-green-300'
                      : ''
                  }

                  ${
                    item.sla === 'WARNING'
                      ? 'bg-yellow-500/20 text-yellow-300'
                      : ''
                  }

                  ${
                    item.sla === 'CRITICAL'
                      ? 'bg-red-500/20 text-red-300'
                      : ''
                  }
                `}
              >
                {item.sla}
              </div>

            </div>

            <div className="space-y-2 text-sm">

              <div className="flex justify-between">
                <span className="text-zinc-400">
                  Status
                </span>

                <span>
                  {item.kitchen_status}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-zinc-400">
                  Waiting
                </span>

                <span>
                  {item.minutesWaiting} min
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-zinc-400">
                  Course
                </span>

                <span>
                  {item.course || 'MAIN'}
                </span>
              </div>

            </div>

          </div>
        ))}

      </div>

    </div>
  )
}
