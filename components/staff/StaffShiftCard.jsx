export default function StaffShiftCard({
  shiftActive,
  shiftLoading,
  shiftDuration,
  startShift,
  endShift,
}) {

  return (
    <div className="mb-6 overflow-hidden rounded-[28px] border border-emerald-500/10 bg-gradient-to-br from-emerald-500/10 via-black to-cyan-500/10 backdrop-blur-3xl">

      <div className="border-b border-white/5 px-5 py-4">

        <div className="text-[11px] uppercase tracking-[0.3em] text-emerald-300">
          Shift Runtime
        </div>

        <div className="mt-1 text-xl font-black text-white">
          Live Shift Engine
        </div>

      </div>

      <div className="p-5">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-[10px] uppercase tracking-[0.3em] text-white/35">
              Runtime Status
            </div>

            <div className="mt-2 text-3xl font-black text-white">
              {shiftActive ? "ON SHIFT" : "OFF SHIFT"}
            </div>

            <div className="mt-2 text-sm text-cyan-300">
              {shiftDuration}
            </div>

          </div>

          <div className="flex gap-3">

            {!shiftActive ? (

              <button
                onClick={startShift}
                disabled={shiftLoading}
                className="rounded-[18px] bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-3 text-sm font-black text-white"
              >
                {shiftLoading
                  ? "STARTING..."
                  : "START SHIFT"}
              </button>

            ) : (

              <button
                onClick={endShift}
                disabled={shiftLoading}
                className="rounded-[18px] bg-gradient-to-r from-red-500 to-orange-500 px-5 py-3 text-sm font-black text-white"
              >
                {shiftLoading
                  ? "ENDING..."
                  : "END SHIFT"}
              </button>

            )}

          </div>

        </div>

      </div>

    </div>
  );
}
