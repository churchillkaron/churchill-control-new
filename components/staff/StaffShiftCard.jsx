export default function StaffShiftCard({
  shiftActive,
  shiftLoading,
  shiftDuration,
  startShift,
  endShift,
}) {

  return (

    <div className="relative mb-6 overflow-hidden rounded-[36px] border border-emerald-500/10 bg-gradient-to-br from-emerald-500/10 via-black to-cyan-500/10 backdrop-blur-3xl">

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_30%)]" />

      <div className="relative z-10 before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-white/5 before:opacity-0 before:transition-all before:duration-700 hover:before:opacity-100">

        <div className="border-b border-white/5 px-6 py-5">

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

            <div>

              <div className="text-[11px] uppercase tracking-[0.4em] text-emerald-300">
                Shift Runtime
              </div>

              <div className="mt-2 text-3xl font-black text-white">
                Venue Access Control
              </div>

              <div className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">
                Connect into the live hospitality runtime and synchronize with
                operational venue systems, nightlife momentum and team flow.
              </div>

            </div>

            <div className={`rounded-[26px] border px-5 py-4 ${
              shiftActive
                ? "border-emerald-500/20 bg-emerald-500/10"
                : "border-white/10 bg-black/30"
            }`}>

              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                Runtime Status
              </div>

              <div className={`mt-3 text-3xl font-black ${
                shiftActive
                  ? "text-emerald-400"
                  : "text-white"
              }`}>

                {shiftActive
                  ? "LIVE"
                  : "OFFLINE"}

              </div>

              <div className="mt-2 text-sm text-cyan-300">
                {shiftDuration}
              </div>

            </div>

          </div>

        </div>

        <div className="grid gap-px bg-white/5 xl:grid-cols-[1fr_320px]">

          <div className="bg-black/30 p-6">

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">

                <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">
                  Venue Sync
                </div>

                <div className="mt-3 text-lg font-black text-white">
                  ACTIVE
                </div>

                <div className="mt-2 text-xs text-white/40">
                  Live operational connection
                </div>

              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">

                <div className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-300">
                  Team Network
                </div>

                <div className="mt-3 text-lg font-black text-white">
                  SYNCED
                </div>

                <div className="mt-2 text-xs text-white/40">
                  Staff momentum alignment
                </div>

              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">

                <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-300">
                  Runtime Access
                </div>

                <div className="mt-3 text-lg font-black text-white">
                  VERIFIED
                </div>

                <div className="mt-2 text-xs text-white/40">
                  Hospitality system authorization
                </div>

              </div>

            </div>

          </div>

          <div className="bg-black/40 p-6">

            <div className="text-[11px] uppercase tracking-[0.35em] text-white/35">
              Shift Control
            </div>

            <div className="mt-3 text-2xl font-black text-white">
              {shiftActive
                ? "Exit Runtime"
                : "Enter Runtime"}
            </div>

            <div className="mt-3 text-sm leading-relaxed text-white/45">
              {shiftActive
                ? "Disconnect from the active venue runtime and close operational session."
                : "Join the live venue runtime and activate operational synchronization."}
            </div>

            <div className="mt-6">

              {!shiftActive ? (

                <button
                  onClick={startShift}
                  disabled={shiftLoading}
                  className="w-full rounded-[24px] bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-5 text-sm font-black uppercase tracking-[0.25em] text-white"
                >

                  {shiftLoading
                    ? "CONNECTING..."
                    : "ENTER RUNTIME"}

                </button>

              ) : (

                <button
                  onClick={endShift}
                  disabled={shiftLoading}
                  className="w-full rounded-[24px] bg-gradient-to-r from-red-500 to-orange-500 px-6 py-5 text-sm font-black uppercase tracking-[0.25em] text-white"
                >

                  {shiftLoading
                    ? "DISCONNECTING..."
                    : "EXIT RUNTIME"}

                </button>

              )}

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}
