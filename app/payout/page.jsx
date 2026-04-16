export default function Payout() {
  // SAME CORE DATA (must match Control)
  const data = {
    revenue: 128450,
    foodCost: 38000,
    staffCost: 42000,
    otherCost: 12000,
  };

  // PROFIT CALCULATION
  const totalCost = data.foodCost + data.staffCost + data.otherCost;
  const profit = data.revenue - totalCost;
  const margin = Math.round((profit / data.revenue) * 100);

  // PAYOUT LOGIC (IDENTICAL TO CONTROL)
  let payoutStatus = "GOOD";
  let payoutLevel = 100;

  if (margin < 30) {
    payoutStatus = "WARNING";
    payoutLevel = 70;
  }

  if (margin < 20) {
    payoutStatus = "BAD";
    payoutLevel = 40;
  }

  if (margin < 10) {
    payoutStatus = "CRITICAL";
    payoutLevel = 0;
  }

  const servicePool = Math.round(data.revenue * 0.05);
  const payoutPool = Math.round((servicePool * payoutLevel) / 100);

  const fohShare = Math.round(payoutPool * 0.5);
  const barShare = Math.round(payoutPool * 0.3);
  const kitchenShare = Math.round(payoutPool * 0.2);

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
            <h1 className="text-2xl font-semibold">Payout System</h1>
            <p className="text-white/60 text-sm">
              Service charge and team distribution
            </p>
          </div>

          {/* STATUS */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-black/40 p-6 rounded-xl border border-white/10">
              <p className="text-white/50 text-sm">Status</p>
              <h2 className="text-2xl mt-2 text-[#ffb36b]">{payoutStatus}</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl border border-white/10">
              <p className="text-white/50 text-sm">Payout Level</p>
              <h2 className="text-2xl mt-2">{payoutLevel}%</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl border border-white/10">
              <p className="text-white/50 text-sm">Margin</p>
              <h2 className="text-2xl mt-2">{margin}%</h2>
            </div>
          </div>

          {/* POOL */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Service Pool</h2>

            <div className="bg-black/40 p-6 rounded-xl border border-white/10">
              <p className="text-white/50 text-sm">Total Distribution</p>
              <h2 className="text-3xl mt-2">THB {payoutPool}</h2>
            </div>
          </div>

          {/* DISTRIBUTION */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Team Distribution</h2>

            <div className="grid md:grid-cols-3 gap-6">

              <div className="bg-black/40 p-6 rounded-xl border border-white/10">
                <p className="text-white/50 text-sm">FOH (50%)</p>
                <h2 className="text-2xl mt-2">THB {fohShare}</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl border border-white/10">
                <p className="text-white/50 text-sm">Bar (30%)</p>
                <h2 className="text-2xl mt-2">THB {barShare}</h2>
              </div>

              <div className="bg-black/40 p-6 rounded-xl border border-white/10">
                <p className="text-white/50 text-sm">Kitchen (20%)</p>
                <h2 className="text-2xl mt-2">THB {kitchenShare}</h2>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}