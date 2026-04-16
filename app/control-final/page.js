export default function ControlFinal() {
  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img src="/bg-hero-control.jpg" className="w-full h-full object-cover" />
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 -z-20 bg-black/70" />

      {/* CONTENT */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-16 space-y-10">

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-[0_20px_60px_rgba(0,0,0,0.5)] space-y-10">

          {/* HEADER */}
          <div>
            <h1 className="text-2xl font-semibold">Control Final</h1>
            <p className="text-white/60 text-sm">
              Real-time decision engine for your venue
            </p>
          </div>

          {/* PERFORMANCE */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Performance</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Revenue</p>
                <h2 className="text-2xl mt-2">THB 128,450</h2>
              </div>
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Orders</p>
                <h2 className="text-2xl mt-2">186</h2>
              </div>
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Margin</p>
                <h2 className="text-2xl mt-2 text-[#ffb36b]">Stable</h2>
              </div>
            </div>
          </div>

          {/* STAFF PERFORMANCE */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Staff Performance</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">FOH</p>
                <h3 className="mt-2">Strong</h3>
              </div>
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Bar</p>
                <h3 className="mt-2">Weak</h3>
              </div>
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Kitchen</p>
                <h3 className="mt-2">Stable</h3>
              </div>
            </div>
          </div>

          {/* 🔥 AI DECISION LAYER */}
          <div>
            <h2 className="text-xl font-semibold mb-4">AI Decisions</h2>

            <div className="space-y-4">

              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Revenue Optimization</p>
                <p className="mt-2 text-[#ffb36b]">
                  Increase Pad Thai price by 5% — high demand detected
                </p>
              </div>

              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Staff Action</p>
                <p className="mt-2 text-red-400">
                  Bar performance low — push drink upselling
                </p>
              </div>

              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Operational Adjustment</p>
                <p className="mt-2 text-white/70">
                  Kitchen load high — expect slower service
                </p>
              </div>

            </div>
          </div>

          {/* SYSTEM STATUS */}
          <div>
            <h2 className="text-xl font-semibold mb-4">System Status</h2>
            <div className="bg-black/40 rounded-xl p-6 border border-white/10 flex justify-between">
              <h2 className="text-2xl text-[#ffb36b]">GOOD</h2>
              <p className="text-white/60">System performing within target</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}