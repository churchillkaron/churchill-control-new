export default function Dashboard() {
  const trendBars = [42, 58, 51, 69, 63, 74, 88];

  return (
    <div className="relative min-h-screen text-white overflow-hidden">
      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="Dashboard background"
          className="w-full h-full object-cover"
        />
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.72),rgba(18,12,8,0.82))]" />

      {/* WARM GLOW */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_20%,rgba(255,140,0,0.14),transparent_40%),radial-gradient(circle_at_20%_30%,rgba(255,180,80,0.08),transparent_35%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 pt-28 pb-14 space-y-8 md:space-y-10">
        {/* HEADER */}
        <div className="space-y-2">
          <p className="text-[11px] md:text-xs uppercase tracking-[0.25em] text-white/45">
            Churchill Control
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm md:text-base text-white/65 max-w-2xl">
            Financial visibility, operational pressure, and venue performance in one executive view.
          </p>
        </div>

        {/* HERO */}
        <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03))] backdrop-blur-2xl shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,179,107,0.22),transparent_35%),linear-gradient(to_bottom,rgba(255,255,255,0.10),transparent_28%)]" />
          <div className="relative grid grid-cols-1 lg:grid-cols-[1.4fr_0.8fr] gap-6 p-6 md:p-8 lg:p-10">
            <div className="space-y-4 md:space-y-5">
              <p className="text-white/60 text-sm">Today Revenue</p>
              <div className="space-y-2">
                <h2 className="text-4xl md:text-6xl font-semibold tracking-tight">
                  THB 128,450
                </h2>
                <p className="text-sm md:text-base text-white/70">
                  <span className="text-[#ffb36b] font-medium">+12.4%</span> vs yesterday
                </p>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <div className="rounded-2xl bg-black/20 border border-white/10 px-4 py-3 min-w-[140px]">
                  <p className="text-xs text-white/50">Margin Status</p>
                  <p className="mt-1 text-base font-medium text-[#ffcf9a]">Stable</p>
                </div>
                <div className="rounded-2xl bg-black/20 border border-white/10 px-4 py-3 min-w-[140px]">
                  <p className="text-xs text-white/50">Traffic Signal</p>
                  <p className="mt-1 text-base font-medium">Strong</p>
                </div>
                <div className="rounded-2xl bg-black/20 border border-white/10 px-4 py-3 min-w-[140px]">
                  <p className="text-xs text-white/50">Ticket Direction</p>
                  <p className="mt-1 text-base font-medium">Holding</p>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-[rgba(12,10,8,0.28)] backdrop-blur-xl p-5 md:p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <p className="text-sm text-white/55">Owner Insight</p>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/35">Revenue Signal</p>
                  <p className="mt-1 text-lg font-medium">Revenue holding above target</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/35">Pressure Point</p>
                  <p className="mt-1 text-white/75">
                    Covers remain healthy. Next improvement comes from lifting average ticket, not traffic.
                  </p>
                </div>
                <div className="pt-2">
                  <button className="rounded-xl bg-gradient-to-r from-[#ff7a00] to-[#ffb36b] px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_24px_rgba(255,122,0,0.35)] hover:scale-[1.02] transition">
                    Review Control Final
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI STRIP */}
        <div className="rounded-[24px] border border-white/10 bg-[rgba(18,14,11,0.42)] backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.28)] overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-4">
            <div className="p-5 md:p-6 border-b md:border-b-0 md:border-r border-white/10">
              <p className="text-xs uppercase tracking-[0.18em] text-white/40">Profit</p>
              <p className="mt-2 text-2xl font-semibold">THB 42,300</p>
            </div>
            <div className="p-5 md:p-6 border-b md:border-b-0 md:border-r border-white/10">
              <p className="text-xs uppercase tracking-[0.18em] text-white/40">Covers</p>
              <p className="mt-2 text-2xl font-semibold">186</p>
            </div>
            <div className="p-5 md:p-6 border-b md:border-b-0 md:border-r border-white/10">
              <p className="text-xs uppercase tracking-[0.18em] text-white/40">Avg Ticket</p>
              <p className="mt-2 text-2xl font-semibold">THB 690</p>
            </div>
            <div className="p-5 md:p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-white/40">Open Orders</p>
              <p className="mt-2 text-2xl font-semibold">14</p>
            </div>
          </div>
        </div>

        {/* TREND + INSIGHT */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.85fr] gap-6">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(18,14,11,0.42)] backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.35)] p-6 md:p-8">
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.08),transparent_25%)]" />
            <div className="relative">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                    Revenue Trend
                  </p>
                  <h3 className="mt-2 text-2xl md:text-3xl font-semibold">
                    7 Day Revenue Movement
                  </h3>
                </div>
                <p className="text-sm text-[#ffcf9a]">
                  Trend: Stable ↑
                </p>
              </div>

              <div className="mt-8">
                <div className="flex items-end gap-3 md:gap-4 h-56">
                  {trendBars.map((height, index) => (
                    <div key={index} className="flex-1 flex flex-col justify-end items-center gap-3">
                      <div
                        className="w-full max-w-[54px] rounded-t-2xl rounded-b-lg bg-gradient-to-t from-[#ff7a00] via-[#ff9d3b] to-[#ffd19a] shadow-[0_8px_18px_rgba(255,122,0,0.30)]"
                        style={{ height: `${height * 2}px` }}
                      />
                      <span className="text-[11px] uppercase tracking-[0.12em] text-white/35">
                        D{index + 1}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 h-px bg-white/10" />
                <p className="mt-4 text-sm text-white/65">
                  Revenue stabilizing. Focus: lift average ticket to improve margin quality without depending on more traffic.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[rgba(18,14,11,0.42)] backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.35)] p-6 md:p-8 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">Control Notes</p>
              <h3 className="mt-2 text-2xl font-semibold">Executive Summary</h3>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-white/35">Revenue</p>
              <p className="mt-2 text-white/85">Holding above target with stable daily flow.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-white/35">Margin</p>
              <p className="mt-2 text-white/85">Healthy, but average ticket still has room to expand.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-white/35">Action</p>
              <p className="mt-2 text-white/85">Push premium mix, upsell intelligently, and protect cost discipline.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}