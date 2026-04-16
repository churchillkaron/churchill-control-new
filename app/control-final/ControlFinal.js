export default function ControlFinal() {
  return (
    <div className="relative min-h-screen text-white">

      {/* BACKGROUND IMAGE */}
      <div className="fixed inset-0 -z-30">
        <img
          src="/bg-beach.jpg"
          alt="bg"
          className="w-full h-full object-cover"
        />
      </div>

      {/* WARM DARK OVERLAY (NOT BLACK) */}
      <div className="fixed inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(20,15,10,0.7),rgba(40,25,10,0.85))]" />

      {/* GOLD LIGHT GLOW */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(255,140,0,0.25),transparent_60%)]" />

      {/* MAIN */}
      <div className="pt-24 px-6 max-w-7xl mx-auto">

        {/* MAIN GLASS CONTAINER */}
        <div className="rounded-2xl backdrop-blur-xl bg-[rgba(30,20,10,0.55)] border border-[rgba(255,180,80,0.25)] shadow-[0_30px_80px_rgba(0,0,0,0.6)] p-6 space-y-6">

          {/* HEADER */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold">
                Control Final
              </h1>
              <p className="text-sm text-white/60">
                Live operational control
              </p>
            </div>

            <button className="px-5 py-2 rounded-lg bg-[#ff7a00] text-white font-medium shadow-[0_8px_20px_rgba(255,122,0,0.5)] hover:opacity-90 transition">
              Save Set
            </button>
          </div>

          {/* GRID */}
          <div className="grid grid-cols-3 gap-6">

            {/* LEFT PANEL */}
            <div className="col-span-1 rounded-xl backdrop-blur-md bg-[rgba(20,15,10,0.6)] border border-[rgba(255,255,255,0.08)] p-4 space-y-4">

              <h3 className="font-medium">
                Today’s Performance
              </h3>

              <div>
                <p className="text-sm text-white/60">
                  Margin Pressure
                </p>
                <p className="font-semibold text-[#ffb36b]">
                  Stable
                </p>
              </div>

              {/* MINI TREND */}
              <div className="h-20 flex items-end gap-2">
                {[30, 50, 45, 60, 55, 65, 70].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-md bg-gradient-to-t from-[#ff7a00] to-[#ffb36b] shadow-[0_4px_10px_rgba(255,122,0,0.4)]"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>

              <div>
                <p className="text-sm text-white/60">
                  Active Orders
                </p>
                <p className="font-semibold">
                  14 open
                </p>
              </div>

              <div>
                <p className="text-sm text-white/60">
                  Current Revenue
                </p>
                <p className="font-semibold">
                  THB 96,230
                </p>
              </div>

            </div>

            {/* RIGHT PANEL */}
            <div className="col-span-2 rounded-xl backdrop-blur-md bg-[rgba(40,25,10,0.55)] border border-[rgba(255,180,80,0.2)] p-6 space-y-4">

              {/* HEADER */}
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">
                  Dish Control
                </h2>

                <input
                  placeholder="Search"
                  className="bg-[rgba(255,255,255,0.1)] px-3 py-1 rounded-md outline-none placeholder-white/50"
                />
              </div>

              {/* TABLE HEAD */}
              <div className="grid grid-cols-3 text-sm text-white/50 border-b border-white/10 pb-2">
                <div>Dish</div>
                <div className="text-center">Sold</div>
                <div className="text-right">Revenue</div>
              </div>

              {/* ROWS */}
              {[
                { name: "Pad Thai", sold: 85, revenue: "42,500" },
                { name: "Tuna Tartare", sold: 54, revenue: "21,600" },
                { name: "Ribeye Steak", sold: 44, revenue: "32,130" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="grid grid-cols-3 py-3 border-b border-white/5 hover:bg-white/5 transition"
                >
                  <div>{item.name}</div>
                  <div className="text-center">{item.sold}</div>
                  <div className="text-right">
                    THB {item.revenue}
                  </div>
                </div>
              ))}

              {/* FOOTER */}
              <div className="flex justify-between items-center pt-4">

                <p className="text-green-400">
                  ✓ Logic Validated
                </p>

                <button className="px-4 py-2 rounded-lg bg-[rgba(255,255,255,0.1)] border border-white/10 hover:bg-white/20 transition">
                  Save Set
                </button>

              </div>

              <div className="flex justify-between text-sm pt-2">
                <p className="text-white/60">
                  Hall Verification
                </p>
                <p className="text-[#ffb36b]">
                  Operational & Stable
                </p>
              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}