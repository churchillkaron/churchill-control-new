export default function StaffHeader({
  staffAccount,
  shiftActive,
  shiftDuration,
}) {

  const loading =
    !staffAccount;

  return (

    <div className="mb-6 overflow-hidden rounded-[32px] border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/10 via-black to-cyan-500/10 p-6 backdrop-blur-3xl">

      <div className="flex items-start justify-between gap-4">

        <div className="flex items-center gap-4">

          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-black/50 text-3xl font-black text-white">

            {loading
              ? "…"
              : (
                  staffAccount?.name?.[0] ||
                  "?"
                )
            }

          </div>

          <div>

            <div className="text-[11px] uppercase tracking-[0.35em] text-fuchsia-300">
              Powered by Avantiqo
            </div>

            <div className="mt-2 text-4xl font-black text-white">

              {loading
                ? "Connecting Runtime..."
                : (
                    staffAccount?.name ||
                    "Runtime User"
                  )
              }

            </div>

            <div className="mt-2 text-sm uppercase tracking-[0.25em] text-cyan-300">

              {loading
                ? "Loading Enterprise Identity"
                : (
                    staffAccount?.role ||
                    "Runtime"
                  )
              }

            </div>

          </div>

        </div>

        <div className="text-right">

          <div className="text-[11px] uppercase tracking-[0.3em] text-white/40">
            Shift Status
          </div>

          <div className={`mt-3 text-4xl font-black ${
            shiftActive
              ? "text-emerald-400"
              : "text-white"
          }`}>

            {loading
              ? "..."
              : (
                  shiftActive
                    ? "LIVE"
                    : "OFF"
                )
            }

          </div>

          <div className="mt-2 text-sm text-cyan-300">

            {loading
              ? "Syncing runtime..."
              : shiftDuration
            }

          </div>

        </div>

      </div>

    </div>

  );

}
