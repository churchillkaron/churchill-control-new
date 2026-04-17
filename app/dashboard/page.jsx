<AppShell>
  <div className="space-y-10">

    {/* HEADER */}
    <h1 className="text-5xl font-semibold text-white">
      Manager System
    </h1>

    {!latest ? (
      <div className="text-white/70">No data</div>
    ) : (
      <>
        {/* 🔥 HERO KPI */}
        <div className="rounded-3xl border border-white/10 bg-white/10 p-8 backdrop-blur-xl">
          <p className="text-white/60 text-sm mb-2">
            Today’s Revenue
          </p>
          <h2 className="text-5xl font-semibold text-white">
            THB {latest.revenue}
          </h2>
        </div>

        {/* KPI STRIP */}
        <div className="grid grid-cols-3 gap-4">

          <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-white/50 text-sm">Orders</p>
            <p className="text-white text-xl">{latest.orders}</p>
          </div>

          <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-white/50 text-sm">Avg Order</p>
            <p className="text-white text-xl">THB {latest.avgOrder}</p>
          </div>

          <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-white/50 text-sm">FOH Score</p>
            <p className="text-white text-xl">{latest.fohScore}</p>
          </div>

        </div>

        {/* TRENDS */}
        <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
          <p className="text-white mb-4">Last 3 Days</p>
          {last3.map((d, i) => (
            <p key={i} className="text-white/70">
              Day {i + 1}: THB {d.revenue}
            </p>
          ))}
        </div>

        {/* AI INSIGHT */}
        <div className="rounded-3xl border border-yellow-500/20 bg-yellow-500/10 p-6 backdrop-blur-xl">
          <p className="text-yellow-400">
            ⚠ Average order value is dropping
          </p>
        </div>
      </>
    )}
  </div>
</AppShell>