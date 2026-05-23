export default function StaffTimeline({
  runtime,
}) {

  return (
    <div className="mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-black/40 backdrop-blur-3xl">

      <div className="border-b border-white/5 px-5 py-4">

        <div className="text-[11px] uppercase tracking-[0.3em] text-white/35">
          Venue Timeline
        </div>

        <div className="mt-1 text-xl font-black text-white">
          Runtime Events
        </div>

      </div>

      <div className="space-y-3 p-4">

        {(runtime?.staffWithPayout || [])
          .filter((staff) => staff.shift)
          .slice(0, 5)
          .map((staff, index) => (

            <div
              key={index}
              className="rounded-[18px] border border-white/5 bg-white/[0.03] p-4"
            >

              <div className="flex items-center justify-between">

                <div className="text-sm font-bold text-white">
                  {staff.name}
                </div>

                <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">
                  {staff.shift?.clock_out
                    ? "ENDED"
                    : "LIVE"}
                </div>

              </div>

              <div className="mt-2 text-sm text-white/55">
                {staff.role} runtime active
              </div>

            </div>

          ))}

      </div>

    </div>
  );
}
