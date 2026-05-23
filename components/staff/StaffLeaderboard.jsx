export default function StaffLeaderboard({
  runtime,
}) {

  return (
    <div className="mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-black/40 backdrop-blur-3xl">

      <div className="border-b border-white/5 px-5 py-4">

        <div className="text-[11px] uppercase tracking-[0.3em] text-white/35">
          Runtime Ranking
        </div>

        <div className="mt-1 text-xl font-black text-white">
          Live Staff Leaderboard
        </div>

      </div>

      <div className="space-y-2 p-4">

        {(runtime?.staffWithPayout || [])
          .sort(
            (a, b) =>
              (b.payrollAmount || 0) -
              (a.payrollAmount || 0)
          )
          .slice(0, 5)
          .map((staff, index) => (

            <div
              key={index}
              className="flex items-center justify-between rounded-[18px] border border-white/5 bg-white/[0.03] px-4 py-3"
            >

              <div>

                <div className="text-sm font-bold text-white">
                  #{index + 1} {staff.name}
                </div>

                <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/35">
                  {staff.role}
                </div>

              </div>

              <div className="text-right">

                <div className="text-sm font-black text-emerald-300">
                  ฿{staff.payrollAmount || 0}
                </div>

                <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/35">
                  Score {staff.score || 0}
                </div>

              </div>

            </div>

          ))}

      </div>

    </div>
  );
}
