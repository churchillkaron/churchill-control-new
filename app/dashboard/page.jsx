export default function DashboardPage() {
  return (
    <div className="space-y-16">

      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-semibold text-[#2b2b2b]">
          Dashboard
        </h1>
        <p className="text-[#7a7468] mt-1">
          Operational overview and financial control
        </p>
      </div>

      {/* HERO - REVENUE */}
      <div className="relative rounded-2xl p-10 bg-gradient-to-b from-[#f9f1dc] to-[#d3c29f] shadow-[0_20px_60px_rgba(0,0,0,0.12)] overflow-hidden">

        {/* subtle glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,122,0,0.15),transparent_60%)]" />

        <div className="relative">
          <p className="text-sm text-[#7a7468]">Today Revenue</p>

          <h2 className="text-5xl font-semibold text-[#2b2b2b] mt-2">
            THB 128,450
          </h2>

          <p className="mt-3 text-sm text-[#7a7468]">
            <span className="text-[#ff7a00] font-medium">+12%</span> vs yesterday
          </p>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="rounded-2xl px-8 py-6 bg-[#efe4cd] shadow-[inset_0_2px_6px_rgba(0,0,0,0.04)] flex justify-between">

        <div>
          <p className="text-sm text-[#7a7468]">Profit</p>
          <p className="text-xl font-semibold text-[#2b2b2b] mt-1">
            THB 42,300
          </p>
        </div>

        <div className="w-px bg-[#d6cbb0]" />

        <div>
          <p className="text-sm text-[#7a7468]">Covers</p>
          <p className="text-xl font-semibold text-[#2b2b2b] mt-1">
            186
          </p>
        </div>

        <div className="w-px bg-[#d6cbb0]" />

        <div>
          <p className="text-sm text-[#7a7468]">Avg Ticket</p>
          <p className="text-xl font-semibold text-[#2b2b2b] mt-1">
            THB 690
          </p>
        </div>

      </div>

      {/* TREND SECTION */}
      <div className="space-y-4">

        {/* TITLE ROW */}
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-[#2b2b2b]">
            7 Day Revenue Movement
          </h3>
          <p className="text-sm text-[#7a7468]">
            Trend: <span className="text-[#ff7a00]">Stable ↑</span>
          </p>
        </div>

        {/* TREND CARD */}
        <div className="relative rounded-2xl p-8 bg-[#efe4cd] shadow-[0_12px_30px_rgba(0,0,0,0.08)] overflow-hidden">

          {/* top highlight */}
          <div className="absolute top-0 left-0 w-full h-20 bg-gradient-to-b from-white/40 to-transparent" />

          <div className="relative">

            {/* BARS */}
            <div className="flex items-end justify-between h-40 mt-4">

              {[40, 60, 55, 70, 65, 75, 90].map((h, i) => (
                <div
                  key={i}
                  className="w-10 rounded-xl bg-gradient-to-t from-[#ff7a00] to-[#ffb36b] shadow-[0_6px_12px_rgba(255,122,0,0.35)]"
                  style={{ height: `${h}%` }}
                />
              ))}

            </div>

            {/* FOOTER INSIGHT */}
            <div className="flex justify-between items-center mt-6 text-sm text-[#7a7468]">
              <p>
                Revenue stabilizing. Focus: increase average ticket to improve margin.
              </p>
            </div>

          </div>
        </div>
      </div>

    </div>
  );
}