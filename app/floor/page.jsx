import { getFloorTables } from '@/lib/floor/getFloorTables'

export default async function FloorPage() {

  const tables =
    await getFloorTables()

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Restaurant Floor Control
        </h1>

        <p className="text-zinc-400 mt-2">
          Live Table Operations
        </p>

      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6">

        {tables.map(table => (

          <div
            key={table.id}
            className={`
              rounded-3xl
              border
              backdrop-blur-xl
              p-6
              min-h-[220px]
              flex
              flex-col
              justify-between

              ${
                table.status === 'AVAILABLE'
                  ? 'bg-green-500/10 border-green-500/20'
                  : ''
              }

              ${
                table.status === 'OCCUPIED'
                  ? 'bg-red-500/10 border-red-500/20'
                  : ''
              }
            `}
          >

            <div>

              <div className="flex items-center justify-between">

                <h2 className="text-3xl font-bold">
                  {table.table_name}
                </h2>

                <div
                  className={`
                    w-4
                    h-4
                    rounded-full

                    ${
                      table.status === 'AVAILABLE'
                        ? 'bg-green-400'
                        : 'bg-red-400'
                    }
                  `}
                />

              </div>

              <div className="mt-4 space-y-2 text-sm">

                <div className="flex justify-between">

                  <span className="text-zinc-400">
                    Status
                  </span>

                  <span>
                    {table.status}
                  </span>

                </div>

                <div className="flex justify-between">

                  <span className="text-zinc-400">
                    Guests
                  </span>

                  <span>
                    {table.current_guests || 0}
                  </span>

                </div>

                <div className="flex justify-between">

                  <span className="text-zinc-400">
                    Capacity
                  </span>

                  <span>
                    {table.capacity}
                  </span>

                </div>

              </div>

            </div>

            <div
              className="
                mt-6
                text-center
                rounded-2xl
                py-3
                bg-white/10
                text-sm
                font-semibold
              "
            >
              {table.status === 'AVAILABLE'
                ? 'Ready'
                : 'Active Service'}
            </div>

          </div>
        ))}

      </div>

    </div>
  )
}
