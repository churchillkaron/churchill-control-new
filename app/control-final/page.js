import { getControlData } from "../../lib/controlLogic";

export default function ControlFinal() {
  const {
    data,
    profit,
    margin,
    payoutStatus,
    payoutLevel,
    decisions,
    fohScore,
    barScore,
    kitchenScore,
    averageScore,
  } = getControlData();

  return (
    <div className="relative min-h-screen text-white">

      <div className="absolute inset-0 -z-30">
        <img src="/bg-hero-control.jpg" className="w-full h-full object-cover" />
      </div>

      <div className="absolute inset-0 -z-20 bg-black/70" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-16 space-y-10">

        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 space-y-10">

          <h1 className="text-2xl">Control Final</h1>

          {/* PROFIT */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-black/40 p-6 rounded-xl">
              <p>Revenue</p>
              <h2>{data.revenue}</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl">
              <p>Profit</p>
              <h2>{profit}</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl">
              <p>Margin</p>
              <h2>{margin}%</h2>
            </div>
          </div>

          {/* 🔥 STAFF SCORES */}
          <div>
            <h2 className="text-xl mb-4">Staff Performance</h2>

            <div className="grid md:grid-cols-4 gap-6">

              <div className="bg-black/40 p-6 rounded-xl">
                <p>FOH</p>
                <h2>{fohScore}/100</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl">
                <p>Bar</p>
                <h2>{barScore}/100</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl">
                <p>Kitchen</p>
                <h2>{kitchenScore}/100</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl">
                <p>Team Avg</p>
                <h2>{averageScore}/100</h2>
              </div>

            </div>
          </div>

          {/* STATUS */}
          <div className="bg-black/40 p-6 rounded-xl">
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