export default function ControlFinal() {
  // 🔥 CORE DATA (simulate real system)

  const data = {
    revenue: 128450,
    foodCost: 38000,
    staffCost: 42000,
    otherCost: 12000,
  };

  // 🔥 PROFIT CALCULATION

  const totalCost = data.foodCost + data.staffCost + data.otherCost;
  const profit = data.revenue - totalCost;
  const margin = Math.round((profit / data.revenue) * 100);

  // 🔥 DECISION ENGINE

  let decisions = [];

  if (margin > 30) {
    decisions.push({
      type: "Profit",
      message: "Strong margin — opportunity to scale revenue",
      color: "#ffb36b",
    });
  }

  if (margin < 20) {
    decisions.push({
      type: "Warning",
      message: "Margin dropping — reduce costs or increase pricing",
      color: "red",
    });
  }

  if (data.foodCost > 40000) {
    decisions.push({
      type: "Cost",
      message: "Food cost high — review suppliers or portion size",
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
              Profit-based decision engine
            </p>
          </div>

          {/* 🔥 PROFIT CORE */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Financial Core</h2>

            <div className="grid md:grid-cols-4 gap-6">

              <div className="bg-black/40 p-6 rounded-xl border border-white/10">
                <p className="text-white/50 text-sm">Revenue</p>
                <h2 className="text-2xl mt-2">THB {data.revenue}</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl border border-white/10">
                <p className="text-white/50 text-sm">Total Cost</p>
                <h2 className="text-2xl mt-2">THB {totalCost}</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl border border-white/10">
                <p className="text-white/50 text-sm">Profit</p>
                <h2 className="text-2xl mt-2 text-[#ffb36b]">
                  THB {profit}
                </h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl border border-white/10">
                <p className="text-white/50 text-sm">Margin</p>
                <h2 className="text-2xl mt-2">{margin}%</h2>
              </div>

            </div>
          </div>

          {/* 🔥 COST BREAKDOWN */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Cost Breakdown</h2>

            <div className="grid md:grid-cols-3 gap-6">

              <div className="bg-black/40 p-6 rounded-xl border border-white/10">
                <p className="text-white/50 text-sm">Food Cost</p>
                <h2 className="text-xl mt-2">THB {data.foodCost}</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl border border-white/10">
                <p className="text-white/50 text-sm">Staff Cost</p>
                <h2 className="text-xl mt-2">THB {data.staffCost}</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl border border-white/10">
                <p className="text-white/50 text-sm">Other Cost</p>
                <h2 className="text-xl mt-2">THB {data.otherCost}</h2>
              </div>

            </div>
          </div>

          {/* 🔥 AI DECISIONS (PROFIT BASED) */}
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