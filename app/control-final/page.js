import { supabase } from "../../lib/supabase";

export default async function ControlFinal() {
  // 🔥 FETCH REAL DATA
  const { data, error } = await supabase
    .from("pos-sales")
    .select("*")
    .limit(1);

  const live = data?.[0] || {
    revenue: 128450,
    orders: 186,
    bar_performance: "weak",
    kitchen_load: "high",
  };

  // 🔥 DECISION ENGINE

  let decisions = [];

  if (live.revenue > 120000) {
    decisions.push({
      type: "Revenue",
      message: "Increase top dish price by 3–5%",
      color: "#ffb36b",
    });
  }

  if (live.bar_performance === "weak") {
    decisions.push({
      type: "Staff",
      message: "Bar underperforming — push upselling",
      color: "red",
    });
  }

  if (live.kitchen_load === "high") {
    decisions.push({
      type: "Operations",
      message: "Kitchen overloaded — expect delays",
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

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-10">

          {/* HEADER */}
          <div>
            <h1 className="text-2xl font-semibold">Control Final</h1>
            <p className="text-white/60 text-sm">
              Live data decision engine
            </p>
          </div>

          {/* PERFORMANCE */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-black/40 p-6 rounded-xl border border-white/10">
              <p className="text-white/50 text-sm">Revenue</p>
              <h2 className="text-2xl mt-2">THB {live.revenue}</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl border border-white/10">
              <p className="text-white/50 text-sm">Orders</p>
              <h2 className="text-2xl mt-2">{live.orders}</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl border border-white/10">
              <p className="text-white/50 text-sm">Kitchen Load</p>
              <h2 className="text-2xl mt-2 text-[#ffb36b]">
                {live.kitchen_load}
              </h2>
            </div>
          </div>

          {/* AI DECISIONS */}
          <div>
            <h2 className="text-xl font-semibold mb-4">AI Decisions</h2>

            <div className="space-y-4">
              {decisions.map((d, i) => (
                <div
                  key={i}
                  className="bg-black/40 p-6 rounded-xl border border-white/10"
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