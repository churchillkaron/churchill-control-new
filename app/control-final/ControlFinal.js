export default function ControlFinal() {
  return (
    <div className="relative min-h-screen text-white">

      {/* BACKGROUND */}
      <div className="fixed inset-0 -z-30">
        <img
          src="/bg-beach.jpg"
          alt="bg"
          className="w-full h-full object-cover blur-[3px] scale-105"
        />
      </div>

      {/* OVERLAY */}
      <div className="fixed inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(15,8,0,0.35),rgba(25,12,3,0.55))]" />

      {/* LIGHT */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_70%_30%,rgba(255,140,0,0.25),transparent_60%)]" />

      {/* MAIN */}
      <div className="pt-20 md:pt-24 px-4 md:px-6 max-w-7xl mx-auto">

        {/* GLASS */}
        <div className="relative rounded-2xl backdrop-blur-xl bg-[rgba(20,15,10,0.25)] border border-[rgba(255,200,120,0.35)] shadow-[0_40px_100px_rgba(0,0,0,0.7)] p-4 md:p-6 space-y-6 overflow-hidden">

          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/25 via-white/5 to-transparent" />

          {/* HEADER */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">

            <div>
              <h1 className="text-xl md:text-2xl font-semibold">
                Control Final
              </h1>
              <p className="text-sm text-white/60">
                Live operational control
              </p>
            </div>

            <button className="w-full md:w-auto px-4 md:px-5 py-2 rounded-lg bg-gradient-to-r from-[#ff7a00] to-[#ffb36b] text-white font-medium shadow-[0_0_25px_rgba(255,122,0,0.8)] hover:scale-[1.03] transition">
              Save Set
            </button>

          </div>

          {/* GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">

            {/* LEFT */}
            <div className="rounded-xl backdrop-blur-md bg-[rgba(15,10,5,0.35)] border border-white/10 p-4 space-y-4">

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

              <div className="h-20 flex items-end gap-2">
                {[30, 50, 45, 60, 55, 65, 70].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-md bg-gradient-to-t from-[#ff7a00] to-[#ffb36b] shadow-[0_6px_14px_rgba(255,122,0,0.6)]"
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

            {/* RIGHT */}
            <div className="md:col-span-2 rounded-xl backdrop-blur-md bg-[rgba(40,25,10,0.20)] border border-[rgba(255,200,120,0.25)] p-4 md:p-6 space-y-4">

              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2">
                <h2 className="text-lg font-semibold">
                  Dish Control
                </h2>

                <input
                  placeholder="Search"
                  className="bg-white/10 px-3 py-1 rounded-md outline-none placeholder-white/50 w-full md:w-auto"
                />
              </div>

              <div className="grid grid-cols-3 text-sm text-white/50 border-b border-white/10 pb-2">
                <div>Dish</div>
                <div className="text-center">Sold</div>
                <div className="text-right">Revenue</div>
              </div>

              {[
                { name: "Pad Thai", sold: 85, revenue: "42,500" },
                { name: "Tuna Tartare", sold: 54, revenue: "21,600" },
                { name: "Ribeye Steak", sold: 44, revenue: "32,130" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="grid grid-cols-3 py-3 border-b border-white/5 text-sm md:text-base"
                >
                  <div>{item.name}</div>
                  <div className="text-center">{item.sold}</div>
                  <div className="text-right">
                    THB {item.revenue}
                  </div>
                </div>
              ))}

              <div className="flex justify-between items-center pt-4">
                <p className="text-green-400">
                  ✓ Logic Validated
                </p>

                <button className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-sm">
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