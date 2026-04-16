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

          {/* DISH CONTROL */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Dish Control</h2>
            <div className="space-y-4">
              <div className="bg-black/40 rounded-xl p-6 border border-white/10 flex justify-between">
                <div>
                  <p className="text-white/50 text-sm">Pad Thai</p>
                  <p className="text-lg">Top seller</p>
                </div>
                <p className="text-[#ffb36b]">↑ Revenue</p>
              </div>
              <div className="bg-black/40 rounded-xl p-6 border border-white/10 flex justify-between">
                <div>
                  <p className="text-white/50 text-sm">Green Curry</p>
                  <p className="text-lg">Low margin</p>
                </div>
                <p className="text-red-400">↓ Profit</p>
              </div>
            </div>
          </div>

          {/* STAFF PERFORMANCE */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Staff Performance</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">FOH Team</p>
                <h3 className="text-lg mt-2">Strong</h3>
                <p className="text-[#ffb36b] text-sm mt-2">
                  Upselling driving higher ticket value
                </p>
              </div>
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Bar Team</p>
                <h3 className="text-lg mt-2">Weak</h3>
                <p className="text-red-400 text-sm mt-2">
                  Low drink conversion affecting revenue
                </p>
              </div>
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Kitchen</p>
                <h3 className="text-lg mt-2">Stable</h3>
                <p className="text-white/60 text-sm mt-2">
                  Output consistent, no delays detected
                </p>
              </div>
            </div>
          </div>

          {/* LIVE OPERATIONS */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Live Operations</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Active Tables</p>
                <h2 className="text-2xl mt-2">18</h2>
              </div>
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Open Orders</p>
                <h2 className="text-2xl mt-2">42</h2>
              </div>
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Kitchen Load</p>
                <h2 className="text-2xl mt-2 text-[#ffb36b]">High</h2>
              </div>
            </div>
          </div>

          {/* 🔥 SYSTEM STATUS */}
          <div>
            <h2 className="text-xl font-semibold mb-4">System Status</h2>

            <div className="bg-black/40 rounded-xl p-6 border border-white/10 flex justify-between items-center">

              <div>
                <p className="text-white/50 text-sm">Overall Status</p>
                <h2 className="text-2xl mt-2 text-[#ffb36b]">GOOD</h2>
              </div>

              <div className="text-right">
                <p className="text-white/50 text-sm">Signal</p>
                <p className="text-white/70">
                  Operations stable, revenue performing well
                </p>
              </div>

            </div>
          </div>

          {/* 🔥 PAYOUT IMPACT */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Payout Impact</h2>

            <div className="grid md:grid-cols-3 gap-6">

              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Service Pool (5%)</p>
                <h2 className="text-2xl mt-2">THB 6,422</h2>
              </div>

              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Payout Level</p>
                <h2 className="text-2xl mt-2 text-[#ffb36b]">100%</h2>
              </div>

              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Impact</p>
                <h2 className="text-2xl mt-2">Full Distribution</h2>
              </div>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
}