export default function StaffLeaderboard({
  runtime,
}) {

  const ranking =
    (runtime?.staffWithPayout || [])
      .sort(
        (a, b) =>
          (b.score || 0) -
          (a.score || 0)
      )
      .slice(0, 5);

  function getLevel(score) {

    if (score >= 90) {
      return {
        label: "ELITE",
        accent:
          "from-fuchsia-500/20 to-cyan-500/20 border-fuchsia-500/20 text-fuchsia-300",
      };
    }

    if (score >= 70) {
      return {
        label: "HIGH",
        accent:
          "from-cyan-500/20 to-emerald-500/20 border-cyan-500/20 text-cyan-300",
      };
    }

    if (score >= 40) {
      return {
        label: "ACTIVE",
        accent:
          "from-emerald-500/20 to-orange-500/20 border-emerald-500/20 text-emerald-300",
      };
    }

    return {
      label: "LOW",
      accent:
        "from-white/5 to-white/5 border-white/10 text-white/50",
    };

  }

  return (

    <div className="mb-6 overflow-hidden rounded-[32px] border border-white/10 bg-black/40 backdrop-blur-3xl transition-all duration-500 hover:scale-[1.005] hover:border-white/20">

      <div className="border-b border-white/5 px-5 py-5">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-[11px] uppercase tracking-[0.35em] text-fuchsia-300">
              Team Momentum
            </div>

            <div className="mt-2 text-2xl font-black text-white">
              Live Performance Ranking
            </div>

          </div>

          <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-emerald-300">
            LIVE
          </div>

        </div>

      </div>

      <div className="space-y-4 p-5">

        {ranking.map((staff, index) => {

          const level =
            getLevel(
              staff.score || 0
            );

          return (

            <div
              key={index}
              className={`rounded-[28px] border bg-gradient-to-r p-5 transition-all duration-300 hover:scale-[1.01] ${level.accent}`}
            >

              <div className="flex items-center justify-between gap-4">

                <div className="flex items-center gap-4">

                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-black/30 text-lg font-black text-white">

                    #{index + 1}

                  </div>

                  <div>

                    <div className="text-xl font-black text-white">
                      {staff.name}
                    </div>

                    <div className="mt-1 flex items-center gap-2">

                      <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">
                        {staff.role}
                      </div>

                      <div className="h-1 w-1 rounded-full bg-white/30" />

                      <div className={`text-[10px] uppercase tracking-[0.25em] ${level.accent.split(" ").pop()}`}>
                        {level.label}
                      </div>

                    </div>

                  </div>

                </div>

                <div className="text-right">

                  <div className="text-3xl font-black text-white">
                    {staff.score || 0}
                  </div>

                  <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-white/40">
                    Runtime Score
                  </div>

                </div>

              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">

                <div className="rounded-[18px] border border-white/10 bg-black/20 p-3">

                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                    Revenue Impact
                  </div>

                  <div className="mt-2 text-lg font-black text-emerald-300">
                    ฿{staff.payrollAmount || 0}
                  </div>

                </div>

                <div className="rounded-[18px] border border-white/10 bg-black/20 p-3">

                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                    Momentum State
                  </div>

                  <div className="mt-2 text-lg font-black text-white">
                    {level.label}
                  </div>

                </div>

              </div>

            </div>

          );

        })}

      </div>

    </div>

  );

}
