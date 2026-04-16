import { getControlData } from "../../lib/controlLogic";

export default function Payout() {
  const {
    payoutStatus,
    payoutLevel,
    payoutPool,
    fohShare,
    barShare,
    kitchenShare,
    margin,
  } = getControlData();

  return (
    <div className="relative min-h-screen text-white">

      <div className="absolute inset-0 -z-30">
        <img src="/bg-hero-control.jpg" className="w-full h-full object-cover" />
      </div>

      <div className="absolute inset-0 -z-20 bg-black/70" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-16 space-y-10">

        <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-10">

          <h1 className="text-2xl font-semibold">Payout</h1>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-black/40 p-6 rounded-xl">
              <p>Status</p>
              <h2>{payoutStatus}</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl">
              <p>Level</p>
              <h2>{payoutLevel}%</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl">
              <p>Margin</p>
              <h2>{margin}%</h2>
            </div>
          </div>

          <div className="bg-black/40 p-6 rounded-xl">
            <p>Total Pool</p>
            <h2>THB {payoutPool}</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-black/40 p-6 rounded-xl">
              <p>FOH</p>
              <h2>{fohShare}</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl">
              <p>Bar</p>
              <h2>{barShare}</h2>
            </div>

            <div className="bg-black/40 p-6 rounded-xl">
              <p>Kitchen</p>
              <h2>{kitchenShare}</h2>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}