export default function ControlFinal() {
  // 🔥 SIMPLE LOGIC ENGINE

  const revenue = 128450;
  const barPerformance = "weak"; // strong / weak
  const kitchenLoad = "high"; // low / medium / high

  let decisions = [];

  // Revenue logic
  if (revenue > 120000) {
    decisions.push({
      type: "Revenue",
      message: "High revenue detected — increase top dish price by 3–5%",
      color: "#ffb36b",
    });
  }

  // Bar logic
  if (barPerformance === "weak") {
    decisions.push({
      type: "Staff",
      message: "Bar underperforming — push drink upselling immediately",
      color: "red",
    });
  }

  // Kitchen logic
  if (kitchenLoad === "high") {
    decisions.push({
      type: "Operations",
      message: "Kitchen overloaded — expect slower service",
      color: "#ccc",
    });
  }

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
              Real-time decision engine
            </p>
          </div>

          {/* PERFORMANCE */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Performance</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                <p className="text-white/50 text-sm">Revenue</p>
                <h2 className="text-2xl mt-2">THB {revenue}</h2>
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

          {/* 🔥 AI DECISION LAYER (DYNAMIC) */}
          <div>
            <h2 className="text-xl font-semibold mb-4">AI Decisions</h2>

            <div className="space-y-4">

              {decisions.map((d, i) => (
                <div
                  key={i}
                  className="bg-black/40 rounded-xl p-6 border border-white/10"
                >
                  <p className="text-white/50 text-sm">{d.type}</p>
                  <p className="mt-2" style={{ color: d.color }}>
                    {d.message}
                  </p>
                </div>
              ))}

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}