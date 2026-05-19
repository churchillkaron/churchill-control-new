import { getProcurementDashboard } from '@/lib/procurement/getProcurementDashboard'

export default async function ProcurementPage() {

  const dashboard =
    await getProcurementDashboard()

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Procurement Control Center
        </h1>

        <p className="text-zinc-400 mt-2">
          Purchasing & Supplier Operations
        </p>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">

          <div className="text-zinc-400 text-sm">
            Low Stock Alerts
          </div>

          <div className="text-4xl font-bold mt-3">
            {dashboard.lowStock.length}
          </div>

        </div>

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">

          <div className="text-zinc-400 text-sm">
            Pending PO
          </div>

          <div className="text-4xl font-bold mt-3">
            {dashboard.pendingPO.length}
          </div>

        </div>

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">

          <div className="text-zinc-400 text-sm">
            Pending Invoices
          </div>

          <div className="text-4xl font-bold mt-3">
            {dashboard.pendingInvoices.length}
          </div>

        </div>

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">

          <div className="text-zinc-400 text-sm">
            Suppliers
          </div>

          <div className="text-4xl font-bold mt-3">
            {dashboard.totalSuppliers}
          </div>

        </div>

      </div>

      <div className="bg-white/10 border border-white/10 rounded-3xl p-6">

        <h2 className="text-2xl font-bold mb-6">
          Low Stock Ingredients
        </h2>

        <div className="space-y-4">

          {dashboard.lowStock.map(item => (

            <div
              key={item.id}
              className="
                flex
                items-center
                justify-between
                bg-black/30
                rounded-2xl
                p-4
              "
            >

              <div>

                <div className="font-semibold">
                  {item.name}
                </div>

                <div className="text-zinc-500 text-sm mt-1">
                  Minimum: {item.minimum_stock}
                </div>

              </div>

              <div className="text-right">

                <div className="text-red-400 font-bold text-xl">
                  {item.stock}
                </div>

                <div className="text-zinc-500 text-sm">
                  Remaining
                </div>

              </div>

            </div>
          ))}

        </div>

      </div>

    </div>
  )
}
