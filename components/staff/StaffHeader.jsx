export default function StaffHeader({
  staffAccount,
  shiftActive,
  shiftDuration,
  runtime,
  shiftStatus,
}) {

  const loading =
    !staffAccount;

  const mood =
    runtime?.venueMood ||
    "Luxury Runtime Stable";

  const phase =
    runtime?.nightlifePhase ||
    "Warmup";

  const pressure =
    runtime?.pressureLevel ||
    "Controlled";

  const revenue =
    runtime?.revenueToday || 0;

  return (

    <div className="relative mb-6 overflow-hidden rounded-[36px] border border-fuchsia-500/10 bg-gradient-to-br from-fuchsia-500/15 via-black to-cyan-500/10 p-7 backdrop-blur-3xl transition-all duration-500 hover:scale-[1.005] hover:border-white/20">

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.15),transparent_30%)]" />

      <div className="relative z-10 before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-white/5 before:opacity-0 before:transition-all before:duration-700 hover:before:opacity-100">

        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">

          <div className="flex items-center gap-5">

            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-black/40 text-4xl font-black text-white shadow-[0_0_40px_rgba(217,70,239,0.25)]">

              {loading
                ? "…"
                : (
                    staffAccount?.name?.[0] ||
                    "?"
                  )
              }

            </div>

            <div>

              <div className="text-[11px] uppercase tracking-[0.45em] text-fuchsia-300">
                Churchill Runtime
              </div>

              <div className="mt-3 text-4xl md:text-5xl font-black leading-none text-white">

                {loading
                  ? "Connecting..."
                  : (
                      staffAccount?.name ||
                      "Runtime User"
                    )
                }

              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">

                <div className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-300">
                  {phase}
                </div>

                <div className="rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.25em] text-orange-300">
                  {pressure}
                </div>

                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-300">
                  {shiftStatus}
                </div>

              </div>

            </div>

          </div>

          <div className="grid grid-cols-2 gap-4 lg:min-w-[360px]">

            <div className="rounded-[28px] border border-white/10 bg-black/30 p-5">

              <div className="text-[10px] uppercase tracking-[0.3em] text-white/35">
                Shift Runtime
              </div>

              <div className={`mt-3 text-4xl font-black ${
                shiftActive
                  ? "text-emerald-400"
                  : "text-white"
              }`}>

                {shiftActive
                  ? "LIVE"
                  : "OFF"}

              </div>

              <div className="mt-2 text-sm text-cyan-300">
                {shiftDuration}
              </div>

            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/30 p-5">

              <div className="text-[10px] uppercase tracking-[0.3em] text-white/35">
                Revenue Tonight
              </div>

              <div className="mt-3 text-3xl font-black text-white">
                ฿{revenue}
              </div>

              <div className="mt-2 text-sm text-fuchsia-300">
                Live venue runtime
              </div>

            </div>

          </div>

        </div>

        <div className="mt-8 rounded-[28px] border border-white/5 bg-black/20 p-5">

          <div className="text-[10px] uppercase tracking-[0.35em] text-white/35">
            Venue Mood
          </div>

          <div className="mt-3 text-2xl font-black text-white">
            {mood}
          </div>

          <div className="mt-3 text-sm leading-relaxed text-white/55">
            The venue runtime is actively monitoring nightlife momentum,
            operational pressure, shift energy and live hospitality performance.
          </div>

        </div>

      </div>

    </div>

  );

}
