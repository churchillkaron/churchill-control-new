export default function Dashboard() {
  return (
    <div className="space-y-10">

      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Dashboard
        </h1>
        <p className="text-[#6b6458] mt-1 text-sm">
          Real-time performance overview
        </p>
      </div>

      {/* HERO CARD (FOCUS) */}
      <div className="
        relative
        rounded-3xl
        p-8
        bg-gradient-to-br from-[#f8efdb] via-[#e8dcc0] to-[#d6c8a6]
        shadow-[0_20px_60px_rgba(0,0,0,0.12)]
        overflow-hidden
      ">

        {/* subtle glow */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-orange-300/20 rounded-full blur-3xl"></div>

        <div className="relative z-10">
          <div className="text-sm text-[#6b6458]">Total Revenue</div>
          <div className="text-4xl font-bold text-[#2f2a24] mt-2">
            THB 0
          </div>
        </div>

      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {[
          { label: "Profit", value: "THB 0" },
          { label: "Covers", value: "0" },
          { label: "Avg Ticket", value: "THB 0" },
        ].map((item, i) => (
          <div
            key={i}
            className="
              rounded-2xl
              p-6
              bg-[#efe4cd]
              border border-[#a89f84]
              shadow-[0_8px_25px_rgba(0,0,0,0.08)]
              hover:shadow-[0_12px_35px_rgba(0,0,0,0.12)]
              transition
            "
          >
            <div className="text-[#6b6458] text-sm mb-1">
              {item.label}
            </div>
            <div className="text-xl font-semibold text-[#2f2a24]">
              {item.value}
            </div>
          </div>
        ))}

      </div>

      {/* CHART AREA */}
      <div className="
        rounded-3xl
        p-8
        bg-[#efe4cd]
        border border-[#a89f84]
        shadow-[0_12px_40px_rgba(0,0,0,0.1)]
      ">

        <div className="flex justify-between items-center mb-6">
          <h2 className="font-semibold text-[#2f2a24]">
            Revenue Trend
          </h2>
          <span className="text-xs text-[#6b6458]">
            Last 7 days
          </span>
        </div>

        {/* fake smooth bars (better spacing) */}
        <div className="h-40 flex items-end gap-3">
          {[10, 25, 15, 35, 22, 30, 45].map((v, i) => (
            <div
              key={i}
              className="
                flex-1
                rounded-lg
                bg-gradient-to-t from-orange-400 to-orange-200
                shadow-inner
              "
              style={{ height: `${v}%` }}
            />
          ))}
        </div>

      </div>

      {/* INSIGHT */}
      <div className="
        rounded-2xl
        p-6
        bg-[#efe4cd]
        border border-[#a89f84]
        shadow-[0_6px_20px_rgba(0,0,0,0.08)]
      ">
        <div className="font-semibold text-[#2f2a24] mb-1">
          System Insight
        </div>
        <div className="text-sm text-[#6b6458]">
          Revenue stability improving. Monitor profit margin closely.
        </div>
      </div>

    </div>
  );
}