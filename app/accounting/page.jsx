import { getAccountingDashboard } from '@/lib/accounting/getAccountingDashboard'

export default async function AccountingPage() {

  const dashboard =
    await getAccountingDashboard()

  const cards = [

    {
      title:
        'Unpaid AP',
      value:
        dashboard.unpaid_count,
    },

    {
      title:
        'Outstanding',
      value:
        `฿${dashboard.unpaid_total.toFixed(2)}`,
    },

    {
      title:
        'Journal Entries',
      value:
        dashboard.journal_count,
    },

    {
      title:
        'Audit Logs',
      value:
        dashboard.audit_logs,
    },
  ]

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Accounting Control Center
        </h1>

        <p className="text-zinc-400 mt-2">
          Financial Governance & Compliance
        </p>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">

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

            <div className="text-4xl font-bold mt-3">
              {card.value}
            </div>

          </div>
        ))}

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">

          <h2 className="text-2xl font-bold mb-6">
            Accounting Period
          </h2>

          {dashboard.latest_period ? (

            <div className="space-y-4">

              <div className="flex justify-between">

                <span className="text-zinc-400">
                  Month
                </span>

                <span>
                  {dashboard.latest_period.month}
                </span>

              </div>

              <div className="flex justify-between">

                <span className="text-zinc-400">
                  Year
                </span>

                <span>
                  {dashboard.latest_period.year}
                </span>

              </div>

              <div className="flex justify-between">

                <span className="text-zinc-400">
                  Status
                </span>

                <span>
                  {dashboard.latest_period.status}
                </span>

              </div>

            </div>

          ) : (

            <div className="text-zinc-500">
              No accounting periods
            </div>

          )}

        </div>

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">

          <h2 className="text-2xl font-bold mb-6">
            Compliance
          </h2>

          <div className="space-y-4">

            <div className="flex justify-between">

              <span className="text-zinc-400">
                Tax Reports
              </span>

              <span>
                {dashboard.tax_reports}
              </span>

            </div>

            <div className="flex justify-between">

              <span className="text-zinc-400">
                Audit Events
              </span>

              <span>
                {dashboard.audit_logs}
              </span>

            </div>

            <div className="flex justify-between">

              <span className="text-zinc-400">
                Journal Entries
              </span>

              <span>
                {dashboard.journal_count}
              </span>

            </div>

          </div>

        </div>

      </div>

    </div>
  )
}
