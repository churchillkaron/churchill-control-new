export default function ControlFinal() {
  return (
    <div className="relative min-h-screen">

      {/* BACKGROUND IMAGE */}
      <div className="fixed inset-0 -z-20">
        <img
          src="/bg-beach.jpg"
          alt="background"
          className="w-full h-full object-cover"
        />
      </div>

      {/* DARK OVERLAY (CRITICAL FOR READABILITY) */}
      <div className="fixed inset-0 bg-black/30 -z-10" />

      {/* MAIN CONTAINER */}
      <div className="pt-24 px-6 max-w-7xl mx-auto">

        <div className="rounded-2xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-[0_20px_60px_rgba(0,0,0,0.35)] p-6 space-y-6">

          {/* HEADER */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold text-white">
                Control Final
              </h1>
              <p className="text-sm text-white/70">
                Live operational control
              </p>
            </div>

            <button className="px-5 py-2 rounded-lg bg-[#ff7a00] text-white font-medium shadow-lg hover:opacity-90 transition">
              Save Set
            </button>
          </div>

          {/* CONTENT GRID */}
          <div className="grid grid-cols-3 gap-6">

            {/* LEFT PANEL */}
            <div className="col-span-1 rounded-xl backdrop-blur-md bg-white/10 border border-white/10 p-4 space-y-4">

              <h3 className="text-white font-medium">
                Today’s Performance
              </h3>

              <div>
                <p className="text-sm text-white/70">
                  Margin Pressure
                </p>
                <p className="text-white font-semibold">
                  Stable
                </p>
              </div>

              {/* MINI TREND */}
              <div className="h-20 flex items-end gap-2">
                {[30, 50, 45, 60, 55, 65, 70].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-[#ff7a00] to-[#ffb36b] rounded-md"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>

              <div>
                <p className="text-sm text-white/70">
                  Active Orders
                </p>
                <p className="text-white font-semibold">
                  14 open
                </p>
              </div>

              <div>
                <p className="text-sm text-white/70">
                  Current Revenue
                </p>
                <p className="text-white font-semibold">
                  THB 96,230
                </p>
              </div>

            </div>

            {/* RIGHT MAIN PANEL */}
            <div className="col-span-2 rounded-xl backdrop-blur-md bg-white/20 border border-white/20 p-6 space-y-4">

              {/* TITLE */}
              <div className="flex justify-between items-center">
                <h2 className="text-white text-lg font-semibold">
                  Dish Control
                </h2>

                <input
                  placeholder="Search"
                  className="bg-white/20 text-white placeholder-white/60 px-3 py-1 rounded-md outline-none"
                />
              </div>

              {/* TABLE HEADER */}
              <div className="grid grid-cols-3 text-white/70 text-sm border-b border-white/20 pb-2">
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
                  className="grid grid-cols-3 text-white py-3 border-b border-white/10"
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

                <button className="px-4 py-2 rounded-lg bg-white/20 text-white border border-white/20 hover:bg-white/30 transition">
                  Save Set
                </button>

              </div>

              {/* STATUS */}
              <div className="flex justify-between items-center pt-2 text-sm">

                <p className="text-white/70">
                  Hall Verification
                </p>

                <p className="text-green-400">
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