import { getStaffOperations } from '@/lib/staff/getStaffOperations'

export default async function StaffPage() {

  const operations =
    await getStaffOperations()

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Staff Operations Center
        </h1>

        <p className="text-zinc-400 mt-2">
          Shift & Payroll Operations
        </p>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">

          <div className="text-zinc-400 text-sm">
            Active Shifts
          </div>

          <div className="text-5xl font-bold mt-4">
            {operations.active_shifts.length}
          </div>

        </div>

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">

          <div className="text-zinc-400 text-sm">
            Pending Approvals
          </div>

          <div className="text-5xl font-bold mt-4">
            {operations.pending_approvals.length}
          </div>

        </div>

        <div className="bg-white/10 border border-white/10 rounded-3xl p-6">

          <div className="text-zinc-400 text-sm">
            Total Payouts
          </div>

          <div className="text-5xl font-bold mt-4">
            ฿{operations.total_payouts}
          </div>

        </div>

      </div>

      <div className="bg-white/10 border border-white/10 rounded-3xl p-6">

        <h2 className="text-2xl font-bold mb-6">
          Active Staff Shifts
        </h2>

        <div className="space-y-4">

          {operations.active_shifts.map(shift => (

            <div
              key={shift.id}
              className="
                bg-black/30
                rounded-2xl
                p-4
                flex
                items-center
                justify-between
              "
            >

              <div>

                <div className="font-semibold text-lg">
                  {shift.staff_name}
                </div>

                <div className="text-zinc-500 text-sm mt-1">
                  {shift.role}
                </div>

              </div>

              <div className="text-right">

                <div className="text-green-400 font-bold">
                  {shift.status}
                </div>

              </div>

            </div>
          ))}

        </div>

      </div>

    </div>
  )
}
