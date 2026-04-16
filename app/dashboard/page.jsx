export default function Dashboard() {
  return (
    <div>

      {/* TITLE */}
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">

        {/* REVENUE */}
        <div className="
          relative
          rounded-2xl
          border border-[#a89f84]
          bg-gradient-to-b from-[#f5ecd8] to-[#e0d3b8]
          p-6
          shadow-[0_6px_20px_rgba(0,0,0,0.08)]
          hover:shadow-[0_10px_30px_rgba(0,0,0,0.12)]
          transition
        ">
          <div className="text-sm text-[#6b6458] mb-1">Revenue</div>
          <div className="text-2xl font-bold text-[#2f2a24]">THB 0</div>
        </div>

        {/* PROFIT */}
        <div className="
          relative
          rounded-2xl
          border border-[#a89f84]
          bg-gradient-to-b from-[#f5ecd8] to-[#e0d3b8]
          p-6
          shadow-[0_6px_20px_rgba(0,0,0,0.08)]
          hover:shadow-[0_10px_30px_rgba(0,0,0,0.12)]
          transition
        ">
          <div className="text-sm text-[#6b6458] mb-1">Profit</div>
          <div className="text-2xl font-bold text-[#2f2a24]">THB 0</div>
        </div>

      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">

        {/* REVENUE TREND */}
        <div className="
          relative
          rounded-2xl
          border border-[#a89f84]
          bg-gradient-to-b from-[#f5ecd8] to-[#e0d3b8]
          p-6
          shadow-[0_6px_20px_rgba(0,0,0,0.08)]
        ">
          <h2 className="text-[#2f2a24] font-semibold mb-4">Revenue Trend</h2>

          <div className="h-32 flex items-end gap-2">
            {[10, 30, 20, 40, 25, 35, 50].map((v, i) => (
              <div
                key={i}
                className="flex-1 bg-orange-400/80 rounded-sm"
                style={{ height: `${v}%` }}
              />
            ))}
          </div>

        </div>

        {/* PROFIT TREND */}
        <div className="
          relative
          rounded-2xl
          border border-[#a89f84]
          bg-gradient-to-b from-[#f5ecd8] to-[#e0d3b8]
          p-6
          shadow-[0_6px_20px_rgba(0,0,0,0.08)]
        ">
          <h2 className="text-[#2f2a24] font-semibold mb-4">Profit Trend</h2>

          <div className="h-32 flex items-end gap-2">
            {[5, 20, 15, 30, 18, 22, 40].map((v, i) => (
              <div
                key={i}
                className="flex-1 bg-[#2f2a24]/70 rounded-sm"
                style={{ height: `${v}%` }}
              />
            ))}
          </div>

        </div>

      </div>

      {/* INSIGHT */}
      <div className="
        relative
        rounded-2xl
        border border-[#a89f84]
        bg-gradient-to-b from-[#f5ecd8] to-[#e0d3b8]
        p-6
        shadow-[0_6px_20px_rgba(0,0,0,0.08)]
      ">
        <div className="text-[#2f2a24] font-semibold mb-2">System Insight</div>
        <div className="text-[#6b6458] text-sm">
          System tracking revenue and profit trends.
        </div>
      </div>

    </div>
  );
}