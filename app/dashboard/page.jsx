export default function Dashboard() {
  return (
    <div className="px-2 md:px-4 space-y-16">

      {/* HEADER */}
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-[#2b2b2b]">
          Dashboard
        </h1>
        <p className="text-[#7a7468] mt-2">
          Financial overview & performance
        </p>
      </div>

      {/* HERO — THIS IS WHERE LUXURY STARTS */}
      <div className="
        relative
        rounded-[32px]
        p-10
        bg-gradient-to-br from-[#f9f1dc] via-[#e9dcc0] to-[#d3c29f]
        shadow-[0_30px_80px_rgba(0,0,0,0.15)]
        overflow-hidden
      ">

        {/* LIGHT EFFECT */}
        <div className="
          absolute -top-32 -right-32
          w-[400px] h-[400px]
          bg-orange-300/30
          blur-[120px]
          rounded-full
        "></div>

        <div className="relative z-10">

          <div className="text-sm text-[#7a7468]">
            Total Revenue
          </div>

          <div className="text-5xl font-bold text-[#1f1f1f] mt-3">
            THB 0
          </div>

          <div className="mt-6 text-sm text-[#7a7468]">
            Last update: Today
          </div>

        </div>
      </div>

      {/* KPI STRIP (NOT BOX GRID ANYMORE) */}
      <div className="
        flex flex-col md:flex-row gap-6
      ">

        {[
          { label: "Profit", value: "THB 0" },
          { label: "Covers", value: "0" },
          { label: "Avg Ticket", value: "THB 0" },
        ].map((item, i) => (
          <div
            key={i}
            className="
              flex-1
              rounded-2xl
              px-6 py-5
              bg-[#f1e6cf]
              shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_10px_25px_rgba(0,0,0,0.08)]
            "
          >
            <div className="text-xs text-[#7a7468] mb-1">
              {item.label}
            </div>
            <div className="text-xl font-semibold text-[#2b2b2b]">
              {item.value}
            </div>
          </div>
        ))}

      </div>

      {/* TREND SECTION (LESS BOXES, MORE SPACE) */}
      <div className="space-y-8">

        <div>
          <h2 className="text-lg font-semibold text-[#2b2b2b]">
            Revenue Trend
          </h2>
        </div>

        <div className="
          relative
          rounded-[28px]
          p-8
          bg-[#efe4cd]
          shadow-[0_20px_50px_rgba(0,0,0,0.12)]
        ">

          {/* subtle highlight */}
          <div className="absolute inset-0 rounded-[28px] bg-white/20 pointer-events-none"></div>

          <div className="relative h-40 flex items-end gap-4">

            {[10, 30, 20, 40, 25, 35, 50].map((v, i) => (
              <div
                key={i}
                className="
                  flex-1
                  rounded-full
                  bg-gradient-to-t from-orange-500 to-orange-200
                  shadow-[0_4px_10px_rgba(0,0,0,0.15)]
                "
                style={{ height: `${v}%` }}
              />
            ))}

          </div>

        </div>

      </div>

      {/* INSIGHT — MINIMAL, NOT BOX HEAVY */}
      <div className="text-[#6f6a5f] text-sm max-w-xl">
        Revenue stability improving. Focus on increasing average ticket size to optimize margins.
      </div>

    </div>
  );
}