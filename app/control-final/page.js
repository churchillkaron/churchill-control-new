import { getControlData } from "../../lib/controlLogic";

export default function ControlFinal() {
  const {
    data,
    totalCost,
    profit,
    margin,
    payoutStatus,
    payoutLevel,
    payoutPool,
    decisions,
  } = getControlData();

  return (
    <div className="relative min-h-screen text-white">

      <div className="absolute inset-0 -z-30">
        <img src="/bg-hero-control.jpg" className="w-full h-full object-cover" />
      </div>

      <div className="absolute inset-0 -z-20 bg-black/70" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-16 space-y-10">

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-10">

          <h1 className="text-2xl font-semibold">Control Final</h1>

          {/* FINANCIAL */}
          <div className="grid md:grid-cols-4 gap-6">
            <div className="bg-black/40 p-6 rounded-xl border border-white/10">
              <p>Revenue</p>
              <h2>THB {data.revenue}</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl border border-white/10">
              <p>Cost</p>
              <h2>THB {totalCost}</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl border border-white/10">
              <p>Profit</p>
              <h2>THB {profit}</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl border border-white/10">
              <p>Margin</p>
              <h2>{margin}%</h2>
            </div>
          </div>

          {/* STATUS */}
          <div className="bg-black/40 p-6 rounded-xl border border-white/10">
            <p>Status</p>
            <h2>{payoutStatus} ({payoutLevel}%)</h2>
          </div>

          {/* DECISIONS */}
          <div className="space-y-4">
            {decisions.map((d, i) => (
              <div key={i} className="bg-black/40 p-4 rounded-xl">
                {d.message}
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}